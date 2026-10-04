import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import { getMerchantRouteScope } from "../../../../../utils/merchant-route-scope"
import { retrieveMerchantOrderWorkflow } from "../../../../../../workflows/merchant-insights"

export const GET = async (
  request: AuthenticatedMedusaRequest,
  response: MedusaResponse
) => {
  const { result } = await retrieveMerchantOrderWorkflow(request.scope).run({
    input: {
      ...getMerchantRouteScope(request),
      order_id: request.params.orderId,
    },
  })

  response.status(200).json({ order: result })
}
