import type {
  CreateCartWorkflowInputDTO,
} from "@medusajs/framework/types"
import type {
  MedusaResponse,
  MedusaStoreRequest,
} from "@medusajs/framework/http"

import { getStoreMerchantContext } from "../../utils/merchant-request-context"
import { createMerchantCartWorkflow } from "../../../workflows/create-merchant-cart"

export const POST = async (
  request: MedusaStoreRequest<CreateCartWorkflowInputDTO>,
  response: MedusaResponse
) => {
  const context = getStoreMerchantContext(request)
  const { result } = await createMerchantCartWorkflow(request.scope).run({
    input: {
      merchant_id: context.merchant.id,
      sales_channel_id: context.salesChannel.id,
      cart: {
        ...request.validatedBody,
        customer_id: request.auth_context?.actor_id,
        sales_channel_id: context.salesChannel.id,
      },
    },
  })

  response.status(200).json({ cart: result })
}
