import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import { getMerchantRouteScope } from "../../../../utils/merchant-route-scope"
import { listMerchantActivityWorkflow } from "../../../../../workflows/merchant-insights"

export const GET = async (
  request: AuthenticatedMedusaRequest,
  response: MedusaResponse
) => {
  const { result } = await listMerchantActivityWorkflow(request.scope).run({
    input: getMerchantRouteScope(request),
  })

  response.status(200).json({ activities: result.activities })
}
