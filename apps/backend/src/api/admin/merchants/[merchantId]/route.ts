import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import { getMerchantRouteScope } from "../../../utils/merchant-route-scope"
import { requireMerchantRole } from "../../../utils/merchant-request-context"
import { updateMerchantDetailsWorkflow } from "../../../../workflows/merchant-administration"
import { retrieveMerchantManagementWorkflow } from "../../../../workflows/merchant-management"
import { recordMerchantActivity } from "../../../utils/record-merchant-activity"

type UpdateMerchantBody = {
  name: string
}

export const GET = async (
  request: AuthenticatedMedusaRequest,
  response: MedusaResponse
) => {
  const { result } = await retrieveMerchantManagementWorkflow(
    request.scope
  ).run({
    input: getMerchantRouteScope(request),
  })

  response.status(200).json({ merchant: result })
}

export const POST = async (
  request: AuthenticatedMedusaRequest<UpdateMerchantBody>,
  response: MedusaResponse
) => {
  requireMerchantRole(request, ["owner", "admin"])
  const { result } = await updateMerchantDetailsWorkflow(
    request.scope
  ).run({
    input: {
      ...getMerchantRouteScope(request),
      name: request.validatedBody.name,
    },
  })

  await recordMerchantActivity(request, {
    action: "merchant.updated",
    resource_type: "merchant",
    resource_id: request.params.merchantId,
    description: `Updated merchant name to ${request.validatedBody.name}`,
  })

  response.status(200).json({ merchant: result })
}
