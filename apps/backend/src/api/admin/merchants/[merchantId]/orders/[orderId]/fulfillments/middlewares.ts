import type { MiddlewareRoute } from "@medusajs/framework/http"
import { validateAndTransformBody } from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"

export const CreateMerchantOrderFulfillmentSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().trim().min(1),
        quantity: z.number().int().positive(),
      })
    )
    .min(1),
  location_id: z.string().trim().min(1),
  no_notification: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export type CreateMerchantOrderFulfillment = z.infer<
  typeof CreateMerchantOrderFulfillmentSchema
>

export const merchantOrderFulfillmentMiddlewares: MiddlewareRoute[] = [
  {
    matcher:
      "/admin/merchants/:merchantId/orders/:orderId/fulfillments",
    methods: ["POST"],
    middlewares: [
      validateAndTransformBody(CreateMerchantOrderFulfillmentSchema),
    ],
  },
]
