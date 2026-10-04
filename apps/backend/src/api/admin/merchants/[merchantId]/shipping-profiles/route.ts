import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { requireMerchantRole } from "../../../../utils/merchant-request-context"
import { getMerchantRouteScope } from "../../../../utils/merchant-route-scope"
import { recordMerchantActivity } from "../../../../utils/record-merchant-activity"
import { createMerchantShippingProfilesWorkflow } from "../../../../../workflows/merchant-catalog"
import { retrieveMerchantManagementWorkflow } from "../../../../../workflows/merchant-management"

type CreateShippingProfilesBody = {
  shipping_profiles: Array<{ name: string; type: string }>
}

export const GET = async (request: AuthenticatedMedusaRequest, response: MedusaResponse) => {
  const { result } = await retrieveMerchantManagementWorkflow(request.scope).run({
    input: getMerchantRouteScope(request),
  })
  response.status(200).json({
    shipping_profiles:
      (result as Record<string, unknown>).shipping_profiles ?? [],
  })
}

export const POST = async (
  request: AuthenticatedMedusaRequest<CreateShippingProfilesBody>,
  response: MedusaResponse
) => {
  requireMerchantRole(request, ["owner", "admin"])
  const { result } = await createMerchantShippingProfilesWorkflow(request.scope).run({
    input: {
      ...getMerchantRouteScope(request),
      shipping_profiles: request.validatedBody.shipping_profiles,
    },
  })
  await Promise.all(result.map((profile) => recordMerchantActivity(request, {
    action: "shipping_profile.created",
    resource_type: "shipping_profile",
    resource_id: profile.id,
    description: `Created shipping profile ${profile.name}`,
  })))
  response.status(201).json({ shipping_profiles: result })
}
