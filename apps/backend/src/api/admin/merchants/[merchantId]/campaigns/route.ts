import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import { requireMerchantRole } from "../../../../utils/merchant-request-context"
import { getMerchantRouteScope } from "../../../../utils/merchant-route-scope"
import { recordMerchantActivity } from "../../../../utils/record-merchant-activity"
import {
  createMerchantCampaignWorkflow,
  listMerchantCampaignsWorkflow,
} from "../../../../../workflows/merchant-campaigns"
import type {
  CreateMerchantCampaignBody,
  ListMerchantCampaignsQuery,
} from "./middlewares"

export const GET = async (
  request: AuthenticatedMedusaRequest,
  response: MedusaResponse
) => {
  const query = request.validatedQuery as ListMerchantCampaignsQuery
  const { result } = await listMerchantCampaignsWorkflow(request.scope).run({
    input: {
      ...getMerchantRouteScope(request),
      q: query.q,
      limit: query.limit,
      offset: query.offset,
    },
  })

  response.status(200).json(result)
}

export const POST = async (
  request: AuthenticatedMedusaRequest<CreateMerchantCampaignBody>,
  response: MedusaResponse
) => {
  requireMerchantRole(request, ["owner", "admin"])
  const { result } = await createMerchantCampaignWorkflow(request.scope).run({
    input: {
      ...getMerchantRouteScope(request),
      campaign: request.validatedBody,
    },
  })

  await recordMerchantActivity(request, {
    action: "campaign.created",
    resource_type: "campaign",
    resource_id: result.id,
    description: `Created campaign ${result.name}`,
  })
  response.status(201).json({ campaign: result })
}
