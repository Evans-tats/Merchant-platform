import type {
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import { requireMerchantRole } from "../../../../../../utils/merchant-request-context"
import { getMerchantRouteScope } from "../../../../../../utils/merchant-route-scope"
import { verifyMerchantDomainWorkflow } from "../../../../../../../workflows/merchant-administration"
import { recordMerchantActivity } from "../../../../../../utils/record-merchant-activity"

export const POST = async (
  request: MedusaRequest,
  response: MedusaResponse
) => {
  requireMerchantRole(request, ["owner", "admin"])
  const { result } = await verifyMerchantDomainWorkflow(
    request.scope
  ).run({
    input: {
      ...getMerchantRouteScope(request),
      domain_id: request.params.domainId,
    },
  })

  await recordMerchantActivity(request, {
    action: "domain.verified",
    resource_type: "domain",
    resource_id: request.params.domainId,
    description: `Verified domain ${request.params.domainId}`,
  })

  response.status(200).json({ domain: result })
}
