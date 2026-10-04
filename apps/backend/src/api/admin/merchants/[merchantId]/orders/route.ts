import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import { getMerchantRouteScope } from "../../../../utils/merchant-route-scope"
import { listMerchantOrdersWorkflow } from "../../../../../workflows/merchant-insights"

export const GET = async (
  request: AuthenticatedMedusaRequest,
  response: MedusaResponse
) => {
  const { result } = await listMerchantOrdersWorkflow(request.scope).run({
    input: getMerchantRouteScope(request),
  })

  response.status(200).json({ orders: result.orders, count: result.count })
}
