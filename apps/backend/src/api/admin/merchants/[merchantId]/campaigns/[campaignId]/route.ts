import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import { requireMerchantRole } from "../../../../../utils/merchant-request-context"
import { getMerchantRouteScope } from "../../../../../utils/merchant-route-scope"
import { recordMerchantActivity } from "../../../../../utils/record-merchant-activity"
import {
  deleteMerchantCampaignWorkflow,
  retrieveMerchantCampaignWorkflow,
  updateMerchantCampaignWorkflow,
} from "../../../../../../workflows/merchant-campaigns"
import type { UpdateMerchantCampaignBody } from "../middlewares"

export const GET = async (
  request: AuthenticatedMedusaRequest,
  response: MedusaResponse
) => {
  const { result } = await retrieveMerchantCampaignWorkflow(request.scope).run({
    input: {
      ...getMerchantRouteScope(request),
      campaign_id: request.params.campaignId,
    },
  })

  response.status(200).json({ campaign: result })
}

export const POST = async (
  request: AuthenticatedMedusaRequest<UpdateMerchantCampaignBody>,
  response: MedusaResponse
) => {
  requireMerchantRole(request, ["owner", "admin"])
  const { result } = await updateMerchantCampaignWorkflow(request.scope).run({
    input: {
      ...getMerchantRouteScope(request),
      campaign_id: request.params.campaignId,
      update: request.validatedBody,
    },
  })

  await recordMerchantActivity(request, {
    action: "campaign.updated",
    resource_type: "campaign",
    resource_id: result.id,
    description: `Updated campaign ${result.name}`,
  })
  response.status(200).json({ campaign: result })
}

export const DELETE = async (
  request: AuthenticatedMedusaRequest,
  response: MedusaResponse
) => {
  requireMerchantRole(request, ["owner", "admin"])
  const { result } = await deleteMerchantCampaignWorkflow(request.scope).run({
    input: {
      ...getMerchantRouteScope(request),
      campaign_id: request.params.campaignId,
    },
  })

  await recordMerchantActivity(request, {
    action: "campaign.deleted",
    resource_type: "campaign",
    resource_id: result.id,
    description: "Deleted a campaign",
  })
  response.status(200).json(result)
}
