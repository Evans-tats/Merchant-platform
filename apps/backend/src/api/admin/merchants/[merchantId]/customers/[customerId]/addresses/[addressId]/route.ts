import type {
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import { requireMerchantRole } from "../../../../../../../utils/merchant-request-context"
import { getMerchantRouteScope } from "../../../../../../../utils/merchant-route-scope"
import { recordMerchantActivity } from "../../../../../../../utils/record-merchant-activity"
import {
  deleteMerchantCustomerAddressWorkflow,
  updateMerchantCustomerAddressWorkflow,
  type MerchantCustomerAddressInput,
} from "../../../../../../../../workflows/merchant-customer"

type UpdateAddressBody = { address: MerchantCustomerAddressInput }

export const POST = async (
  request: MedusaRequest<UpdateAddressBody>,
  response: MedusaResponse
) => {
  requireMerchantRole(request, ["owner", "admin"])
  const { result } = await updateMerchantCustomerAddressWorkflow(
    request.scope
  ).run({
    input: {
      ...getMerchantRouteScope(request),
      customer_id: request.params.customerId,
      address_id: request.params.addressId,
      address: request.validatedBody.address,
    },
  })

  await recordMerchantActivity(request, {
    action: "customer.address_updated",
    resource_type: "customer",
    resource_id: request.params.customerId,
    description: "Updated a merchant customer address",
  })
  response.status(200).json({ customer: result })
}

export const DELETE = async (
  request: MedusaRequest,
  response: MedusaResponse
) => {
  requireMerchantRole(request, ["owner", "admin"])
  const { result } = await deleteMerchantCustomerAddressWorkflow(
    request.scope
  ).run({
    input: {
      ...getMerchantRouteScope(request),
      customer_id: request.params.customerId,
      address_id: request.params.addressId,
    },
  })

  await recordMerchantActivity(request, {
    action: "customer.address_deleted",
    resource_type: "customer",
    resource_id: request.params.customerId,
    description: "Deleted a merchant customer address",
  })
  response.status(200).json(result)
}
