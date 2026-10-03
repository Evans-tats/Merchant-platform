import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import type { HttpTypes } from "@medusajs/framework/types"

import { requireMerchantRole } from "../../../../../../../../utils/merchant-request-context"
import { getMerchantRouteScope } from "../../../../../../../../utils/merchant-route-scope"
import { refundMerchantPaymentWorkflow } from "../../../../../../../../../workflows/merchant-order-operations"
import { recordMerchantActivity } from "../../../../../../../../utils/record-merchant-activity"

export const POST = async (
  request: AuthenticatedMedusaRequest<HttpTypes.AdminRefundPayment>,
  response: MedusaResponse
) => {
  requireMerchantRole(request, ["owner", "admin"])
  const { result } = await refundMerchantPaymentWorkflow(
    request.scope
  ).run({
    input: {
      ...getMerchantRouteScope(request),
      order_id: request.params.orderId,
      payment_id: request.params.paymentId,
      actor_id: request.auth_context.actor_id,
      refund: request.validatedBody,
    },
  })

  await recordMerchantActivity(request, {
    action: "order.refunded",
    resource_type: "order",
    resource_id: request.params.orderId,
    description: `Refunded a payment for order ${request.params.orderId}`,
    metadata: { payment_id: request.params.paymentId },
    notification: {
      type: "order.refunded",
      severity: "warning",
      title: "Payment refunded",
      message: `A payment was refunded for order ${request.params.orderId}`,
    },
  })

  response.status(200).json({ refund: result })
}
