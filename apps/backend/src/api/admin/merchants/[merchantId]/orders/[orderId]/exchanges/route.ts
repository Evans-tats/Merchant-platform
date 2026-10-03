import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { requireMerchantRole } from "../../../../../../utils/merchant-request-context"
import { getMerchantRouteScope } from "../../../../../../utils/merchant-route-scope"
import { recordMerchantActivity } from "../../../../../../utils/record-merchant-activity"
import { beginMerchantOrderExchangeWorkflow } from "../../../../../../../workflows/merchant-order-operations"

type ExchangeBody = {
  description?: string
  internal_note?: string
}

export const POST = async (
  request: AuthenticatedMedusaRequest<ExchangeBody>,
  response: MedusaResponse
) => {
  requireMerchantRole(request, ["owner", "admin"])
  const { result } = await beginMerchantOrderExchangeWorkflow(request.scope).run({
    input: {
      ...getMerchantRouteScope(request),
      order_id: request.params.orderId,
      actor_id: request.auth_context.actor_id,
      description: request.validatedBody.description,
      internal_note: request.validatedBody.internal_note,
    },
  })

  await recordMerchantActivity(request, {
    action: "order.exchange_requested",
    resource_type: "order",
    resource_id: request.params.orderId,
    description: `Started an exchange for order ${request.params.orderId}`,
    notification: {
      type: "order.exchange_requested",
      title: "Exchange requested",
      message: `An exchange was started for order ${request.params.orderId}`,
    },
  })
  response.status(201).json({ exchange: result })
}
