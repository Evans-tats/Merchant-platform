import type {
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import { getMerchantRouteScope } from "../../../../utils/merchant-route-scope"
import { retrieveMerchantReportsWorkflow } from "../../../../../workflows/merchant-insights"

export const GET = async (
  request: MedusaRequest,
  response: MedusaResponse
) => {
  const { result } = await retrieveMerchantReportsWorkflow(request.scope).run({
    input: getMerchantRouteScope(request),
  })

  response.status(200).json({ reports: result })
}
