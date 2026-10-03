import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import { getMerchantRouteScope } from "../../../../../../utils/merchant-route-scope"
import { recordMerchantActivity } from "../../../../../../utils/record-merchant-activity"
import { shipMerchantOrderWorkflow } from "../../../../../../../workflows/merchant-order-operations"
import type { CreateMerchantOrderShipment } from "./middlewares"

export const POST = async (
  request: AuthenticatedMedusaRequest<CreateMerchantOrderShipment>,
  response: MedusaResponse
) => {
  const { result } = await shipMerchantOrderWorkflow(request.scope).run({
    input: {
      ...getMerchantRouteScope(request),
      order_id: request.params.orderId,
      actor_id: request.auth_context.actor_id,
      shipment: request.validatedBody,
    },
  })

  await recordMerchantActivity(request, {
    action: "order.shipped",
    resource_type: "order",
    resource_id: request.params.orderId,
    description: "Created an order shipment",
    notification: {
      type: "shipment_created",
      title: "Shipment created",
      message: "An order shipment was created successfully.",
    },
  })
  response.status(200).json({ shipment: result })
}
