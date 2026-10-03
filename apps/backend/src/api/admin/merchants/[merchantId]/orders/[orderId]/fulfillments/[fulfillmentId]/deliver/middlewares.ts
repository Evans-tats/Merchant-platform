import type { MiddlewareRoute } from "@medusajs/framework/http"
import { validateAndTransformBody } from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"

export const DeliverMerchantOrderFulfillmentSchema = z.object({
  no_notification: z.boolean().optional(),
})

export type DeliverMerchantOrderFulfillment = z.infer<
  typeof DeliverMerchantOrderFulfillmentSchema
>

export const merchantOrderDeliveryMiddlewares: MiddlewareRoute[] = [
  {
    matcher:
      "/admin/merchants/:merchantId/orders/:orderId/fulfillments/:fulfillmentId/deliver",
    methods: ["POST"],
    middlewares: [
      validateAndTransformBody(DeliverMerchantOrderFulfillmentSchema),
    ],
  },
]
