import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import { getMerchantRouteScope } from "../../../../../../utils/merchant-route-scope"
import {
  fulfillMerchantOrderWorkflow,
  listMerchantOrderFulfillmentOptionsWorkflow,
} from "../../../../../../../workflows/merchant-order-operations"
import { recordMerchantActivity } from "../../../../../../utils/record-merchant-activity"
import type { CreateMerchantOrderFulfillment } from "./middlewares"

export const GET = async (
  request: AuthenticatedMedusaRequest,
  response: MedusaResponse
) => {
  const { result } = await listMerchantOrderFulfillmentOptionsWorkflow(
    request.scope
  ).run({
    input: {
      ...getMerchantRouteScope(request),
      order_id: request.params.orderId,
      actor_id: request.auth_context.actor_id,
    },
  })

  response.status(200).json(result)
}

export const POST = async (
  request: AuthenticatedMedusaRequest<CreateMerchantOrderFulfillment>,
  response: MedusaResponse
) => {
  const { result } = await fulfillMerchantOrderWorkflow(
    request.scope
  ).run({
    input: {
      ...getMerchantRouteScope(request),
      order_id: request.params.orderId,
      actor_id: request.auth_context.actor_id,
      fulfillment: request.validatedBody,
    },
  })

  await recordMerchantActivity(request, {
    action: "order.fulfilled",
    resource_type: "order",
    resource_id: request.params.orderId,
    description: `Created a fulfillment for order ${request.params.orderId}`,
    notification: {
      type: "order.fulfilled",
      title: "Order fulfilled",
      message: `A fulfillment was created for order ${request.params.orderId}`,
    },
  })

  response.status(200).json({ fulfillment: result })
}
