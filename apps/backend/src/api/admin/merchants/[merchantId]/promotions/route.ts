import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import { requireMerchantRole } from "../../../../utils/merchant-request-context"
import { getMerchantRouteScope } from "../../../../utils/merchant-route-scope"
import { recordMerchantActivity } from "../../../../utils/record-merchant-activity"
import {
  createMerchantPromotionWorkflow,
  listMerchantPromotionsWorkflow,
} from "../../../../../workflows/merchant-promotions"
import type {
  CreateMerchantPromotionBody,
  ListMerchantPromotionsQuery,
} from "./middlewares"

export const GET = async (
  request: AuthenticatedMedusaRequest,
  response: MedusaResponse
) => {
  const query = request.validatedQuery as ListMerchantPromotionsQuery
  const { result } = await listMerchantPromotionsWorkflow(request.scope).run({
    input: {
      ...getMerchantRouteScope(request),
      q: query.q,
      status: query.status,
      limit: query.limit,
      offset: query.offset,
    },
  })

  response.status(200).json(result)
}

export const POST = async (
  request: AuthenticatedMedusaRequest<CreateMerchantPromotionBody>,
  response: MedusaResponse
) => {
  requireMerchantRole(request, ["owner", "admin"])
  const { campaign, ...promotion } = request.validatedBody
  const { result } = await createMerchantPromotionWorkflow(request.scope).run({
    input: {
      ...getMerchantRouteScope(request),
      promotion,
      campaign,
    },
  })

  await recordMerchantActivity(request, {
    action: "promotion.created",
    resource_type: "promotion",
    resource_id: result.id,
    description: `Created promotion ${result.code}`,
  })
  response.status(201).json({ promotion: result })
}
