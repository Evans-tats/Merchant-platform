import {
  type MiddlewareRoute,
  validateAndTransformQuery,
} from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"

export const GetMerchantSessionSchema = z.object({
  merchant_id: z.string().trim().min(1).optional(),
})

export type GetMerchantSessionQuery = z.infer<
  typeof GetMerchantSessionSchema
>

export const merchantSessionMiddlewares: MiddlewareRoute[] = [
  {
    matcher: "/admin/merchant-session",
    methods: ["GET"],
    middlewares: [
      validateAndTransformQuery(GetMerchantSessionSchema, {}),
    ],
  },
]
