import type { MiddlewareRoute } from "@medusajs/framework/http"
import { validateAndTransformBody } from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"

import { MerchantHandleSchema } from "../../../../utils/merchant-handle-schema"

const categoryFields = {
  name: z.string().trim().min(1).max(255),
  handle: MerchantHandleSchema.optional(),
  description: z.string().trim().max(2000).optional(),
  // Status and visibility, as in Medusa: inactive or internal categories are
  // hidden from the storefront.
  is_active: z.boolean().optional(),
  is_internal: z.boolean().optional(),
  parent_category_id: z.string().min(1).nullable().optional(),
}

export const CreateMerchantCategoriesSchema = z.object({
  product_categories: z.array(z.object(categoryFields)).min(1).max(50),
})

export type CreateMerchantCategoriesBody = z.infer<
  typeof CreateMerchantCategoriesSchema
>

export const UpdateMerchantCategorySchema = z
  .object({
    ...categoryFields,
    name: categoryFields.name.optional(),
    // Position among the merchant's own categories under the parent, as set
    // by dragging in the Organize view.
    rank: z.number().int().min(0).optional(),
  })
  .refine((update) => Object.values(update).some((value) => value !== undefined), {
    message: "Provide at least one category field to update",
  })

export type UpdateMerchantCategoryBody = z.infer<
  typeof UpdateMerchantCategorySchema
>

export const ManageMerchantCategoryProductsSchema = z
  .object({
    add: z.array(z.string().min(1)).max(100).optional(),
    remove: z.array(z.string().min(1)).max(100).optional(),
  })
  .refine(({ add, remove }) => Boolean(add?.length || remove?.length), {
    message: "Provide at least one product to add or remove",
  })

export type ManageMerchantCategoryProductsBody = z.infer<
  typeof ManageMerchantCategoryProductsSchema
>

export const merchantCategoryMiddlewares: MiddlewareRoute[] = [
  {
    matcher: "/admin/merchants/:merchantId/categories",
    methods: ["POST"],
    middlewares: [validateAndTransformBody(CreateMerchantCategoriesSchema)],
  },
  {
    matcher: "/admin/merchants/:merchantId/categories/:categoryId",
    methods: ["POST"],
    middlewares: [validateAndTransformBody(UpdateMerchantCategorySchema)],
  },
  {
    matcher: "/admin/merchants/:merchantId/categories/:categoryId/products",
    methods: ["POST"],
    middlewares: [
      validateAndTransformBody(ManageMerchantCategoryProductsSchema),
    ],
  },
]
