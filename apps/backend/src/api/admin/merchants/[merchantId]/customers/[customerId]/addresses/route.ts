import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import { requireMerchantRole } from "../../../../../../utils/merchant-request-context"
import { getMerchantRouteScope } from "../../../../../../utils/merchant-route-scope"
import { recordMerchantActivity } from "../../../../../../utils/record-merchant-activity"
import {
  createMerchantCustomerAddressWorkflow,
  type MerchantCustomerAddressInput,
} from "../../../../../../../workflows/merchant-customer"

type CreateAddressBody = { address: MerchantCustomerAddressInput }

export const POST = async (
  request: AuthenticatedMedusaRequest<CreateAddressBody>,
  response: MedusaResponse
) => {
  requireMerchantRole(request, ["owner", "admin"])
  const { result } = await createMerchantCustomerAddressWorkflow(
    request.scope
  ).run({
    input: {
      ...getMerchantRouteScope(request),
      customer_id: request.params.customerId,
      address: request.validatedBody.address,
    },
  })

  await recordMerchantActivity(request, {
    action: "customer.address_created",
    resource_type: "customer",
    resource_id: request.params.customerId,
    description: "Added a merchant customer address",
  })
  response.status(201).json({ customer: result })
}
