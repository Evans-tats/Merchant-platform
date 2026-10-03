import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import { getMerchantRouteScope } from "../../../../../utils/merchant-route-scope"
import { recordMerchantActivity } from "../../../../../utils/record-merchant-activity"
import {
  retrieveMerchantProductWorkflow,
  updateMerchantProductFromAdminWorkflow,
} from "../../../../../../workflows/merchant-catalog"
import type { UpdateMerchantProductBody } from "../middlewares"

export const GET = async (
  request: AuthenticatedMedusaRequest,
  response: MedusaResponse
) => {
  const { result } = await retrieveMerchantProductWorkflow(
    request.scope
  ).run({
    input: {
      ...getMerchantRouteScope(request),
      product_id: request.params.productId,
    },
  })

  response.status(200).json({ product: result })
}

export const POST = async (
  request: AuthenticatedMedusaRequest<UpdateMerchantProductBody>,
  response: MedusaResponse
) => {
  const { result } = await updateMerchantProductFromAdminWorkflow(
    request.scope
  ).run({
    input: {
      ...getMerchantRouteScope(request),
      actor_id: request.auth_context.actor_id,
      product_id: request.params.productId,
      update: request.validatedBody.update,
    },
  })

  await recordMerchantActivity(request, {
    action: "product.updated",
    resource_type: "product",
    resource_id: request.params.productId,
    description: `Updated product ${request.params.productId}`,
  })

  response.status(200).json({ product: result[0] })
}
