import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import { getMerchantRouteScope } from "../../../../utils/merchant-route-scope"
import { requireMerchantRole } from "../../../../utils/merchant-request-context"
import { publishMerchantThemeWorkflow } from "../../../../../workflows/merchant-administration"
import { retrieveMerchantManagementWorkflow } from "../../../../../workflows/merchant-management"
import { recordMerchantActivity } from "../../../../utils/record-merchant-activity"

type PublishMerchantThemeBody = {
  configuration: Record<string, unknown>
}

export const GET = async (
  request: AuthenticatedMedusaRequest,
  response: MedusaResponse
) => {
  const { result } = await retrieveMerchantManagementWorkflow(
    request.scope
  ).run({ input: getMerchantRouteScope(request) })
  const themes = (result as Record<string, unknown>).themes as
    | Array<Record<string, unknown>>
    | undefined
  const theme = themes?.find(({ is_active }) => is_active === true)

  response.status(200).json({ theme })
}

export const POST = async (
  request: AuthenticatedMedusaRequest<PublishMerchantThemeBody>,
  response: MedusaResponse
) => {
  requireMerchantRole(request, ["owner", "admin"])
  const { result } = await publishMerchantThemeWorkflow(
    request.scope
  ).run({
    input: {
      ...getMerchantRouteScope(request),
      configuration: request.validatedBody.configuration,
    },
  })

  await recordMerchantActivity(request, {
    action: "theme.published",
    resource_type: "merchant_theme",
    resource_id: result.id,
    description: "Published merchant storefront branding",
  })

  response.status(201).json({ theme: result })
}
