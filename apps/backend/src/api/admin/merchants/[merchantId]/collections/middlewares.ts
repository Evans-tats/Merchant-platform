import type { MiddlewareRoute } from "@medusajs/framework/http"
import { validateAndTransformBody } from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"

import { MerchantHandleSchema } from "../../../../utils/merchant-handle-schema"

const collectionTitle = z.string().trim().min(1).max(255)
const collectionHandle = MerchantHandleSchema

export const CreateMerchantCollectionsSchema = z.object({
  collections: z
    .array(
      z.object({
        title: collectionTitle,
        handle: collectionHandle.optional(),
      })
    )
    .min(1)
    .max(50),
})

export type CreateMerchantCollectionsBody = z.infer<
  typeof CreateMerchantCollectionsSchema
>

export const UpdateMerchantCollectionSchema = z
  .object({
    title: collectionTitle.optional(),
    handle: collectionHandle.optional(),
  })
  .refine(
    ({ title, handle }) => title !== undefined || handle !== undefined,
    { message: "Provide a title or handle to update" }
  )

export type UpdateMerchantCollectionBody = z.infer<
  typeof UpdateMerchantCollectionSchema
>

export const ManageMerchantCollectionProductsSchema = z
  .object({
    add: z.array(z.string().min(1)).max(100).optional(),
    remove: z.array(z.string().min(1)).max(100).optional(),
  })
  .refine(({ add, remove }) => Boolean(add?.length || remove?.length), {
    message: "Provide at least one product to add or remove",
  })

export type ManageMerchantCollectionProductsBody = z.infer<
  typeof ManageMerchantCollectionProductsSchema
>

export const merchantCollectionMiddlewares: MiddlewareRoute[] = [
  {
    matcher: "/admin/merchants/:merchantId/collections",
    methods: ["POST"],
    middlewares: [validateAndTransformBody(CreateMerchantCollectionsSchema)],
  },
  {
    matcher: "/admin/merchants/:merchantId/collections/:collectionId",
    methods: ["POST"],
    middlewares: [validateAndTransformBody(UpdateMerchantCollectionSchema)],
  },
  {
    matcher: "/admin/merchants/:merchantId/collections/:collectionId/products",
    methods: ["POST"],
    middlewares: [
      validateAndTransformBody(ManageMerchantCollectionProductsSchema),
    ],
  },
]
