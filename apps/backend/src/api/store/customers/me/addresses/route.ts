import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import { getStoreMerchantContext } from "../../../../utils/merchant-request-context"
import {
  createMerchantCustomerAddressWorkflow,
  retrieveMerchantCustomerWorkflow,
  type MerchantCustomerAddressInput,
} from "../../../../../workflows/merchant-customer"

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
  const addresses =
    (result as { addresses?: Array<Record<string, unknown>> }).addresses ??
    []

  response.status(200).json({
    addresses,
    count: addresses.length,
    offset: 0,
    limit: addresses.length,
  })
}

export const POST = async (
  request: AuthenticatedMedusaRequest<MerchantCustomerAddressInput>,
  response: MedusaResponse
) => {
  const context = getStoreMerchantContext(request)
  const { result } = await createMerchantCustomerAddressWorkflow(
    request.scope
  ).run({
    input: {
      merchant_id: context.merchant.id,
      customer_id: request.auth_context.actor_id,
      address: request.validatedBody,
    },
  })

  response.status(200).json({ customer: result })
}
