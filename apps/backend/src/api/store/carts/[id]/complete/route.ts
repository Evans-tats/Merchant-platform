import type {
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { getStoreMerchantContext } from "../../../../utils/merchant-request-context"
import { completeMerchantCartWorkflow } from "../../../../../workflows/complete-merchant-cart"

export const POST = async (
  request: MedusaRequest,
  response: MedusaResponse
) => {
  const context = getStoreMerchantContext(request)
  const { result } = await completeMerchantCartWorkflow(
    request.scope
  ).run({
    input: {
      merchant_id: context.merchant.id,
      sales_channel_id: context.salesChannel.id,
      cart_id: request.params.id,
    },
  })
  const query = request.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "order",
    fields: request.queryConfig.fields,
    filters: { id: result.id },
  })

  response.status(200).json({
    type: "order",
    order: data[0],
  })
}
