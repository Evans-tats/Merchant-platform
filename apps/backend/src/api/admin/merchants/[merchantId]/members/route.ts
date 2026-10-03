import type {
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import { getMerchantRouteScope } from "../../../../utils/merchant-route-scope"
import {
  getStaffMerchantContext,
  requireMerchantRole,
} from "../../../../utils/merchant-request-context"
import { createMerchantInvitationWorkflow } from "../../../../../workflows/merchant-administration"
import { retrieveMerchantManagementWorkflow } from "../../../../../workflows/merchant-management"
import { recordMerchantActivity } from "../../../../utils/record-merchant-activity"

type InviteMerchantMemberBody = {
  email: string
  role: "admin" | "staff"
}

export const GET = async (
  request: MedusaRequest,
  response: MedusaResponse
) => {
  const { result } = await retrieveMerchantManagementWorkflow(
    request.scope
  ).run({ input: getMerchantRouteScope(request) })
  const merchant = result as Record<string, unknown>

  response.status(200).json({
    members: merchant.members ?? [],
    invitations: merchant.invitations ?? [],
  })
}

export const POST = async (
  request: MedusaRequest<InviteMerchantMemberBody>,
  response: MedusaResponse
) => {
  requireMerchantRole(request, ["owner", "admin"])
  const context = getStaffMerchantContext(request)
  const { result } = await createMerchantInvitationWorkflow(
    request.scope
  ).run({
    input: {
      ...getMerchantRouteScope(request),
      email: request.validatedBody.email,
      role: request.validatedBody.role,
      invited_by_actor_id: context.member.actor_id,
    },
  })

  await recordMerchantActivity(request, {
    action: "team.invited",
    resource_type: "merchant_invitation",
    resource_id: result.id,
    description: `Invited ${request.validatedBody.email} as ${request.validatedBody.role}`,
  })

  response.status(201).json({ invitation: result })
}
