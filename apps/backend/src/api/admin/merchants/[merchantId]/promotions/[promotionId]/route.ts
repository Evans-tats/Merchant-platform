import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import { requireMerchantRole } from "../../../../../utils/merchant-request-context"
import { getMerchantRouteScope } from "../../../../../utils/merchant-route-scope"
import { recordMerchantActivity } from "../../../../../utils/record-merchant-activity"
import {
  deleteMerchantPromotionWorkflow,
  retrieveMerchantPromotionWorkflow,
  updateMerchantPromotionWorkflow,
} from "../../../../../../workflows/merchant-promotions"
import type { UpdateMerchantPromotionBody } from "../middlewares"

export const GET = async (
  request: AuthenticatedMedusaRequest,
  response: MedusaResponse
) => {
  const { result } = await retrieveMerchantPromotionWorkflow(
    request.scope
  ).run({
    input: {
      ...getMerchantRouteScope(request),
      promotion_id: request.params.promotionId,
    },
  })

  response.status(200).json({ promotion: result })
}

export const POST = async (
  request: AuthenticatedMedusaRequest<UpdateMerchantPromotionBody>,
  response: MedusaResponse
) => {
  requireMerchantRole(request, ["owner", "admin"])
  const { result } = await updateMerchantPromotionWorkflow(request.scope).run({
    input: {
      ...getMerchantRouteScope(request),
      promotion_id: request.params.promotionId,
      update: request.validatedBody,
    },
  })

  await recordMerchantActivity(request, {
    action: "promotion.updated",
    resource_type: "promotion",
    resource_id: result.id,
    description: `Updated promotion ${result.code}`,
  })
  response.status(200).json({ promotion: result })
}

export const DELETE = async (
  request: AuthenticatedMedusaRequest,
  response: MedusaResponse
) => {
  requireMerchantRole(request, ["owner", "admin"])
  const { result } = await deleteMerchantPromotionWorkflow(request.scope).run({
    input: {
      ...getMerchantRouteScope(request),
      promotion_id: request.params.promotionId,
    },
  })

  await recordMerchantActivity(request, {
    action: "promotion.deleted",
    resource_type: "promotion",
    resource_id: result.id,
    description: "Deleted a promotion",
  })
  response.status(200).json(result)
}
