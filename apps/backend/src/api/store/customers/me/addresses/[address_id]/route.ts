import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"

import { getStoreMerchantContext } from "../../../../../utils/merchant-request-context"
import {
  deleteMerchantCustomerAddressWorkflow,
  retrieveMerchantCustomerWorkflow,
  updateMerchantCustomerAddressWorkflow,
  type MerchantCustomerAddressInput,
} from "../../../../../../workflows/merchant-customer"

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
  const address = (
    (result as unknown as {
      addresses?: Array<{ id: string }>
    }).addresses ?? []
  ).find(({ id }) => id === request.params.address_id)

  if (!address) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "Merchant customer address not found"
    )
  }

  response.status(200).json({ address })
}

export const POST = async (
  request: AuthenticatedMedusaRequest<MerchantCustomerAddressInput>,
  response: MedusaResponse
) => {
  const context = getStoreMerchantContext(request)
  const { result } = await updateMerchantCustomerAddressWorkflow(
    request.scope
  ).run({
    input: {
      merchant_id: context.merchant.id,
      customer_id: request.auth_context.actor_id,
      address_id: request.params.address_id,
      address: request.validatedBody,
    },
  })

  response.status(200).json({ customer: result })
}

export const DELETE = async (
  request: AuthenticatedMedusaRequest,
  response: MedusaResponse
) => {
  const context = getStoreMerchantContext(request)
  const { result } = await deleteMerchantCustomerAddressWorkflow(
    request.scope
  ).run({
    input: {
      merchant_id: context.merchant.id,
      customer_id: request.auth_context.actor_id,
      address_id: request.params.address_id,
    },
  })

  response.status(200).json({
    id: result.deleted_id,
    object: "address",
    deleted: true,
    parent: result.customer,
  })
}
