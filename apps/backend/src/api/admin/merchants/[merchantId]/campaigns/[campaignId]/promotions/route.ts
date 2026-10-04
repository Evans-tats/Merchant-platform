import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import { requireMerchantRole } from "../../../../../../utils/merchant-request-context"
import { getMerchantRouteScope } from "../../../../../../utils/merchant-route-scope"
import { recordMerchantActivity } from "../../../../../../utils/record-merchant-activity"
import { manageMerchantCampaignPromotionsWorkflow } from "../../../../../../../workflows/merchant-campaigns"
import type { ManageMerchantCampaignPromotionsBody } from "../../middlewares"

export const POST = async (
  request: AuthenticatedMedusaRequest<ManageMerchantCampaignPromotionsBody>,
  response: MedusaResponse
) => {
  requireMerchantRole(request, ["owner", "admin"])
  const { result } = await manageMerchantCampaignPromotionsWorkflow(
    request.scope
  ).run({
    input: {
      ...getMerchantRouteScope(request),
      campaign_id: request.params.campaignId,
      add: request.validatedBody.add,
      remove: request.validatedBody.remove,
    },
  })

  await recordMerchantActivity(request, {
    action: "campaign.promotions_updated",
    resource_type: "campaign",
    resource_id: result.id,
    description: `Changed the promotions in campaign ${result.name}`,
  })
  response.status(200).json({ campaign: result })
}
