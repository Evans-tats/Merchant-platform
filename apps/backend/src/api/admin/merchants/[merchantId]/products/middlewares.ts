import {
  type MedusaNextFunction,
  type MedusaRequest,
  type MedusaResponse,
  type MiddlewareRoute,
  validateAndTransformBody,
  validateAndTransformQuery,
} from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"

import { requireMerchantRole } from "../../../../utils/merchant-request-context"

const requireMerchantCatalogManager = (
  request: MedusaRequest,
  _response: MedusaResponse,
  next: MedusaNextFunction
) => {
  requireMerchantRole(request, ["owner", "admin"])
  next()
}

const ProductStatusSchema = z.enum([
  "draft",
  "proposed",
  "published",
  "rejected",
])

const ProductPriceSchema = z.object({
  id: z.string().min(1).optional(),
  amount: z.number().finite().nonnegative(),
  currency_code: z.string().trim().toLowerCase().regex(/^[a-z]{3}$/),
})

const ProductOptionSchema = z.object({
  title: z.string().trim().min(1).max(255),
  values: z.array(z.string().trim().min(1).max(255)).min(1).max(100),
})

const CreateProductVariantSchema = z.object({
  title: z.string().trim().min(1).max(255),
  sku: z.string().trim().max(255).optional(),
  manage_inventory: z.boolean().optional(),
  allow_backorder: z.boolean().optional(),
  options: z.record(z.string(), z.string().trim().min(1)),
  prices: z.array(ProductPriceSchema).max(100).optional(),
})

const UpdateProductVariantSchema = CreateProductVariantSchema.extend({
  id: z.string().min(1),
  sku: z.string().trim().max(255).nullable().optional(),
})

const ProductFieldsSchema = z.object({
  title: z.string().trim().min(1).max(255),
  handle: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  subtitle: z.string().trim().max(255).nullable().optional(),
  description: z.string().trim().max(10000).nullable().optional(),
  status: ProductStatusSchema.optional(),
  thumbnail: z.url().nullable().optional(),
  images: z.array(z.object({ url: z.url() })).max(100).optional(),
  collection_id: z.string().min(1).nullable().optional(),
  shipping_profile_id: z.string().min(1).optional(),
  category_ids: z.array(z.string().min(1)).max(100).optional(),
  discountable: z.boolean().optional(),
})

export const CreateMerchantProductsSchema = z.object({
  products: z.array(
    ProductFieldsSchema.extend({
      options: z.array(ProductOptionSchema).min(1).max(3),
      variants: z.array(CreateProductVariantSchema).min(1).max(500),
    })
  ).min(1).max(100),
})

export type CreateMerchantProductsBody = z.infer<
  typeof CreateMerchantProductsSchema
>

export const UpdateMerchantProductSchema = z.object({
  update: ProductFieldsSchema.partial().extend({
    // null resets the product to the merchant's default shipping profile.
    shipping_profile_id: z.string().min(1).nullable().optional(),
    variants: z.array(UpdateProductVariantSchema).min(1).max(500).optional(),
  }).refine((value) => Object.keys(value).length > 0, {
    message: "At least one product field is required",
  }),
})

export type UpdateMerchantProductBody = z.infer<
  typeof UpdateMerchantProductSchema
>

export const ListMerchantProductsSchema = z.object({
  q: z.string().trim().max(255).optional(),
  status: ProductStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  order: z.enum(["created_at", "-created_at", "title", "-title"])
    .default("-created_at"),
})

export type ListMerchantProductsQuery = z.infer<
  typeof ListMerchantProductsSchema
>

export const merchantProductMiddlewares: MiddlewareRoute[] = [
  {
    matcher: "/admin/merchants/:merchantId/products",
    methods: ["GET"],
    middlewares: [
      validateAndTransformQuery(ListMerchantProductsSchema, {
        defaults: ["id"],
        isList: true,
      }),
    ],
  },
  {
    matcher: "/admin/merchants/:merchantId/products",
    methods: ["POST"],
    middlewares: [
      requireMerchantCatalogManager,
      validateAndTransformBody(CreateMerchantProductsSchema),
    ],
  },
  {
    matcher: "/admin/merchants/:merchantId/products/:productId",
    methods: ["POST"],
    middlewares: [
      requireMerchantCatalogManager,
      validateAndTransformBody(UpdateMerchantProductSchema),
    ],
  },
]
