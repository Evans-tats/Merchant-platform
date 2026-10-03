import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import { getMerchantRouteScope } from "../../../../../../../../utils/merchant-route-scope"
import { recordMerchantActivity } from "../../../../../../../../utils/record-merchant-activity"
import { deliverMerchantOrderWorkflow } from "../../../../../../../../../workflows/merchant-order-operations"
import type { DeliverMerchantOrderFulfillment } from "./middlewares"

export const POST = async (
  request: AuthenticatedMedusaRequest<DeliverMerchantOrderFulfillment>,
  response: MedusaResponse
) => {
  await deliverMerchantOrderWorkflow(request.scope).run({
    input: {
      ...getMerchantRouteScope(request),
      order_id: request.params.orderId,
      fulfillment_id: request.params.fulfillmentId,
      actor_id: request.auth_context.actor_id,
      no_notification: request.validatedBody.no_notification,
    },
  })

  await recordMerchantActivity(request, {
    action: "order.fulfillment_delivered",
    resource_type: "order",
    resource_id: request.params.orderId,
    description: "Marked an order fulfillment as delivered",
    metadata: {
      fulfillment_id: request.params.fulfillmentId,
    },
    notification: {
      type: "fulfillment_delivered",
      title: "Fulfillment delivered",
      message: "An order fulfillment was marked as delivered.",
    },
  })

  response.status(200).json({ success: true })
}
