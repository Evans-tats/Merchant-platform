import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import { requireMerchantRole } from "../../../../../utils/merchant-request-context"
import { getMerchantRouteScope } from "../../../../../utils/merchant-route-scope"
import { updateMerchantMemberWorkflow } from "../../../../../../workflows/merchant-administration"
import { recordMerchantActivity } from "../../../../../utils/record-merchant-activity"

type UpdateMerchantMemberBody = {
  role?: "owner" | "admin" | "staff"
  status?: "active" | "suspended"
}

export const POST = async (
  request: AuthenticatedMedusaRequest<UpdateMerchantMemberBody>,
  response: MedusaResponse
) => {
  requireMerchantRole(request, ["owner"])
  const { result } = await updateMerchantMemberWorkflow(
    request.scope
  ).run({
    input: {
      ...getMerchantRouteScope(request),
      member_id: request.params.memberId,
      role: request.validatedBody.role,
      status: request.validatedBody.status,
    },
  })

  await recordMerchantActivity(request, {
    action: "team.member_updated",
    resource_type: "merchant_member",
    resource_id: request.params.memberId,
    description: `Updated merchant member ${request.params.memberId}`,
    metadata: request.validatedBody,
  })

  response.status(200).json({ member: result })
}
