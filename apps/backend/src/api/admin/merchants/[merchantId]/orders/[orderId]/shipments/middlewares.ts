import type { MiddlewareRoute } from "@medusajs/framework/http"
import { validateAndTransformBody } from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"

const ShipmentLabelSchema = z.object({
  tracking_number: z.string().trim().min(1),
  tracking_url: z.url(),
  label_url: z.url(),
})

export const CreateMerchantOrderShipmentSchema = z.object({
  fulfillment_id: z.string().trim().min(1),
  items: z
    .array(
      z.object({
        id: z.string().trim().min(1),
        quantity: z.number().positive(),
      })
    )
    .min(1),
  labels: z.array(ShipmentLabelSchema).optional(),
  no_notification: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export type CreateMerchantOrderShipment = z.infer<
  typeof CreateMerchantOrderShipmentSchema
>

export const merchantOrderShipmentMiddlewares: MiddlewareRoute[] = [
  {
    matcher:
      "/admin/merchants/:merchantId/orders/:orderId/shipments",
    methods: ["POST"],
    middlewares: [
      validateAndTransformBody(CreateMerchantOrderShipmentSchema),
    ],
  },
]
