import type {
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import { requireMerchantRole } from "../../../../../utils/merchant-request-context"
import { getMerchantRouteScope } from "../../../../../utils/merchant-route-scope"
import { recordMerchantActivity } from "../../../../../utils/record-merchant-activity"
import {
  retrieveMerchantCustomerWorkflow,
  updateMerchantCustomerWorkflow,
  type MerchantCustomerProfileUpdate,
} from "../../../../../../workflows/merchant-customer"

type UpdateCustomerBody = { update: MerchantCustomerProfileUpdate }

export const GET = async (
  request: MedusaRequest,
  response: MedusaResponse
) => {
  const { result } = await retrieveMerchantCustomerWorkflow(
    request.scope
  ).run({
    input: {
      ...getMerchantRouteScope(request),
      customer_id: request.params.customerId,
    },
  })

  response.status(200).json({ customer: result })
}

export const POST = async (
  request: MedusaRequest<UpdateCustomerBody>,
  response: MedusaResponse
) => {
  requireMerchantRole(request, ["owner", "admin"])
  const { result } = await updateMerchantCustomerWorkflow(
    request.scope
  ).run({
    input: {
      ...getMerchantRouteScope(request),
      customer_id: request.params.customerId,
      update: request.validatedBody.update,
    },
  })

  await recordMerchantActivity(request, {
    action: "customer.updated",
    resource_type: "customer",
    resource_id: request.params.customerId,
    description: "Updated merchant customer details",
  })
  response.status(200).json({ customer: result })
}
