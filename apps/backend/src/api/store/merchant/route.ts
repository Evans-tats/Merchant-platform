import type {
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import { getStoreMerchantContext } from "../../utils/merchant-request-context"
import { retrieveStorefrontMerchantWorkflow } from "../../../workflows/storefront-merchant"

export const GET = async (
  request: MedusaRequest,
  response: MedusaResponse
) => {
  const context = getStoreMerchantContext(request)
  const { result } = await retrieveStorefrontMerchantWorkflow(
    request.scope
  ).run({
    input: { merchant_id: context.merchant.id },
  })

  response.status(200).json({ merchant: result })
}
