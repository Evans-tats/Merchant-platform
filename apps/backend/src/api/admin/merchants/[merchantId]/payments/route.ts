import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import { requireMerchantRole } from "../../../../utils/merchant-request-context"
import { getMerchantRouteScope } from "../../../../utils/merchant-route-scope"
import { updateMerchantPaymentWorkflow } from "../../../../../workflows/merchant-administration"
import { retrieveMerchantManagementWorkflow } from "../../../../../workflows/merchant-management"
import { recordMerchantActivity } from "../../../../utils/record-merchant-activity"

type UpdateMerchantPaymentBody = {
  provider: "mpesa_stk" | "mpesa_paybill"
  mode: "sandbox" | "production"
  status: "disabled" | "active"
  public_configuration: Record<string, unknown>
  secret_reference?: string | null
}

export const GET = async (
  request: AuthenticatedMedusaRequest,
  response: MedusaResponse
) => {
  requireMerchantRole(request, ["owner", "admin"])
  const { result } = await retrieveMerchantManagementWorkflow(
    request.scope
  ).run({ input: getMerchantRouteScope(request) })
  const paymentConfigs =
    (result as Record<string, unknown>).payment_configs ?? []

  response.status(200).json({ payment_configs: paymentConfigs })
}

export const POST = async (
  request: AuthenticatedMedusaRequest<UpdateMerchantPaymentBody>,
  response: MedusaResponse
) => {
  requireMerchantRole(request, ["owner", "admin"])
  const { result } = await updateMerchantPaymentWorkflow(
    request.scope
  ).run({
    input: {
      ...getMerchantRouteScope(request),
      ...request.validatedBody,
    },
  })

  await recordMerchantActivity(request, {
    action: "payment.configuration_updated",
    resource_type: "payment_configuration",
    resource_id: result.id,
    description: `Updated ${request.validatedBody.provider} configuration`,
    metadata: {
      provider: request.validatedBody.provider,
      mode: request.validatedBody.mode,
      status: request.validatedBody.status,
    },
  })

  response.status(200).json({ payment_config: result })
}
