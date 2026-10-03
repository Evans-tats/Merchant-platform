import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import { requireMerchantRole } from "../../../../../../utils/merchant-request-context"
import { getMerchantRouteScope } from "../../../../../../utils/merchant-route-scope"
import { cancelMerchantOrderWorkflow } from "../../../../../../../workflows/merchant-order-operations"
import { recordMerchantActivity } from "../../../../../../utils/record-merchant-activity"

export const POST = async (
  request: AuthenticatedMedusaRequest,
  response: MedusaResponse
) => {
  requireMerchantRole(request, ["owner", "admin"])
  const { result } = await cancelMerchantOrderWorkflow(
    request.scope
  ).run({
    input: {
      ...getMerchantRouteScope(request),
      order_id: request.params.orderId,
      actor_id: request.auth_context.actor_id,
    },
  })

  await recordMerchantActivity(request, {
    action: "order.canceled",
    resource_type: "order",
    resource_id: request.params.orderId,
    description: `Canceled order ${request.params.orderId}`,
    notification: {
      type: "order.canceled",
      severity: "warning",
      title: "Order canceled",
      message: `Order ${request.params.orderId} was canceled`,
    },
  })

  response.status(200).json({ order: result })
}
