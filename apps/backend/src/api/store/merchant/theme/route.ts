import type {
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import { getStoreMerchantContext } from "../../../utils/merchant-request-context"
import { retrieveStorefrontMerchantWorkflow } from "../../../../workflows/storefront-merchant"

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
  const themes = (result as Record<string, unknown>).themes as
    | Array<Record<string, unknown>>
    | undefined
  const theme = themes?.find(({ is_active }) => is_active === true)

  response.status(200).json({ theme })
}
