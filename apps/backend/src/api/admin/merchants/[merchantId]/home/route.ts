import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { retrieveMerchantHomeWorkflow } from "../../../../../workflows/merchant-insights"
import { getMerchantRouteScope } from "../../../../utils/merchant-route-scope"
import type { GetMerchantHomeSchema } from "./middlewares"

export const GET = async (request: MedusaRequest, response: MedusaResponse) => {
  const { range } = request.validatedQuery as GetMerchantHomeSchema
  const { result } = await retrieveMerchantHomeWorkflow(request.scope).run({
    input: {
      ...getMerchantRouteScope(request),
      range,
    },
  })

  response.status(200).json({ home: result })
}
