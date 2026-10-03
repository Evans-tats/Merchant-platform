import type {
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import { getMerchantRouteScope } from "../../../../utils/merchant-route-scope"
import { retrieveMerchantManagementWorkflow } from "../../../../../workflows/merchant-management"

export const GET = async (
  request: MedusaRequest,
  response: MedusaResponse
) => {
  const { result } = await retrieveMerchantManagementWorkflow(
    request.scope
  ).run({ input: getMerchantRouteScope(request) })
  const orders = (result as Record<string, unknown>).orders ?? []

  response.status(200).json({ orders })
}
