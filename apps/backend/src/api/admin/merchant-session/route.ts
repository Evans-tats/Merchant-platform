import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import { retrieveMerchantSessionWorkflow } from "../../../workflows/merchant-management"
import type { GetMerchantSessionQuery } from "./middlewares"

export const GET = async (
  request: AuthenticatedMedusaRequest,
  response: MedusaResponse
) => {
  const { merchant_id: requestedMerchantId } =
    request.validatedQuery as GetMerchantSessionQuery
  const { result } = await retrieveMerchantSessionWorkflow(
    request.scope
  ).run({
    input: {
      actor_id: request.auth_context.actor_id,
      merchant_id:
        typeof requestedMerchantId === "string"
          ? requestedMerchantId
          : undefined,
    },
  })

  response.status(200).json(result)
}
