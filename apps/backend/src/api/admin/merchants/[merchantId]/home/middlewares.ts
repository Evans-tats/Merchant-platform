import {
  type MiddlewareRoute,
  validateAndTransformQuery,
} from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"

export const GetMerchantHomeSchema = z.object({
  range: z.enum(["today", "7d", "30d"]).default("7d"),
})

export type GetMerchantHomeSchema = z.infer<typeof GetMerchantHomeSchema>

export const merchantHomeMiddlewares: MiddlewareRoute[] = [
  {
    matcher: "/admin/merchants/:merchantId/home",
    methods: ["GET"],
    middlewares: [validateAndTransformQuery(GetMerchantHomeSchema, {})],
  },
]
