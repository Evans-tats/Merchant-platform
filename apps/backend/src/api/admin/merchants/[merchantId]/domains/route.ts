import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import { getMerchantRouteScope } from "../../../../utils/merchant-route-scope"
import { requireMerchantRole } from "../../../../utils/merchant-request-context"
import { addMerchantDomainWorkflow } from "../../../../../workflows/merchant-administration"
import { retrieveMerchantManagementWorkflow } from "../../../../../workflows/merchant-management"
import { recordMerchantActivity } from "../../../../utils/record-merchant-activity"

type AddMerchantDomainBody = {
  hostname: string
}

export const GET = async (
  request: AuthenticatedMedusaRequest,
  response: MedusaResponse
) => {
  const { result } = await retrieveMerchantManagementWorkflow(
    request.scope
  ).run({ input: getMerchantRouteScope(request) })
  const domains = (result as Record<string, unknown>).domains ?? []

  response.status(200).json({ domains })
}

export const POST = async (
  request: AuthenticatedMedusaRequest<AddMerchantDomainBody>,
  response: MedusaResponse
) => {
  requireMerchantRole(request, ["owner", "admin"])
  const { result } = await addMerchantDomainWorkflow(
    request.scope
  ).run({
    input: {
      ...getMerchantRouteScope(request),
      hostname: request.validatedBody.hostname,
    },
  })

  await recordMerchantActivity(request, {
    action: "domain.added",
    resource_type: "domain",
    resource_id: result.domain?.id,
    description: `Added domain ${request.validatedBody.hostname}`,
  })

  response.status(201).json(result)
}
