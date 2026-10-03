import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import type { OrderWorkflow } from "@medusajs/framework/types"

import { requireMerchantRole } from "../../../../../../utils/merchant-request-context"
import { getMerchantRouteScope } from "../../../../../../utils/merchant-route-scope"
import { recordMerchantActivity } from "../../../../../../utils/record-merchant-activity"
import { returnMerchantOrderWorkflow } from "../../../../../../../workflows/merchant-order-operations"

type ReturnBody = Omit<OrderWorkflow.CreateOrderReturnWorkflowInput, "order_id">

export const POST = async (
  request: AuthenticatedMedusaRequest<ReturnBody>,
  response: MedusaResponse
) => {
  requireMerchantRole(request, ["owner", "admin"])
  const { result } = await returnMerchantOrderWorkflow(request.scope).run({
    input: {
      ...getMerchantRouteScope(request),
      order_id: request.params.orderId,
      actor_id: request.auth_context.actor_id,
      return: request.validatedBody,
    },
  })

  await recordMerchantActivity(request, {
    action: "order.returned",
    resource_type: "order",
    resource_id: request.params.orderId,
    description: "Created and received an order return",
    notification: {
      type: "return_created",
      severity: "warning",
      title: "Return processed",
      message: "An order return was processed.",
    },
  })
  response.status(200).json({ return: result })
}
