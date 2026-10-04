import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import { requireMerchantRole } from "../../../../../../../../utils/merchant-request-context"
import { getMerchantRouteScope } from "../../../../../../../../utils/merchant-route-scope"
import { captureMerchantPaymentWorkflow } from "../../../../../../../../../workflows/merchant-order-operations"
import { recordMerchantActivity } from "../../../../../../../../utils/record-merchant-activity"

// "Mark as paid": the merchant confirms they received the money for a manual
// payment, and the rest of the payment is captured.
export const POST = async (
  request: AuthenticatedMedusaRequest,
  response: MedusaResponse
) => {
  requireMerchantRole(request, ["owner", "admin"])
  const { result } = await captureMerchantPaymentWorkflow(request.scope).run({
    input: {
      ...getMerchantRouteScope(request),
      order_id: request.params.orderId,
      payment_id: request.params.paymentId,
      actor_id: request.auth_context.actor_id,
    },
  })
  const order = result.order_number
    ? `order #${result.order_number}`
    : `order ${request.params.orderId}`

  await recordMerchantActivity(request, {
    action: "order.payment_captured",
    resource_type: "order",
    resource_id: request.params.orderId,
    description: `Marked ${order} as paid`,
    metadata: { payment_id: request.params.paymentId },
  })

  response.status(200).json({ payment: result.payment })
}
