import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import { getStoreMerchantContext } from "../../../utils/merchant-request-context"
import {
  retrieveMerchantCustomerWorkflow,
  updateMerchantCustomerWorkflow,
  type MerchantCustomerProfileUpdate,
} from "../../../../workflows/merchant-customer"

export const GET = async (
  request: AuthenticatedMedusaRequest,
  response: MedusaResponse
) => {
  const context = getStoreMerchantContext(request)
  const { result } = await retrieveMerchantCustomerWorkflow(
    request.scope
  ).run({
    input: {
      merchant_id: context.merchant.id,
      customer_id: request.auth_context.actor_id,
    },
  })

  response.status(200).json({ customer: result })
}

export const POST = async (
  request: AuthenticatedMedusaRequest<MerchantCustomerProfileUpdate>,
  response: MedusaResponse
) => {
  const context = getStoreMerchantContext(request)
  const { result } = await updateMerchantCustomerWorkflow(
    request.scope
  ).run({
    input: {
      merchant_id: context.merchant.id,
      customer_id: request.auth_context.actor_id,
      update: request.validatedBody,
    },
  })

  response.status(200).json({ customer: result })
}
