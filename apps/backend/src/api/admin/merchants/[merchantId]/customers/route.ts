import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import { requireMerchantRole } from "../../../../utils/merchant-request-context"
import { getMerchantRouteScope } from "../../../../utils/merchant-route-scope"
import { recordMerchantActivity } from "../../../../utils/record-merchant-activity"
import { createMerchantCustomerWorkflow } from "../../../../../workflows/merchant-customer"
import { listMerchantCustomersWorkflow } from "../../../../../workflows/merchant-management"
import type {
  CreateMerchantCustomerBody,
  ListMerchantCustomersQuery,
} from "./middlewares"

export const GET = async (
  request: AuthenticatedMedusaRequest,
  response: MedusaResponse
) => {
  const query = request.validatedQuery as ListMerchantCustomersQuery
  const { result } = await listMerchantCustomersWorkflow(request.scope).run({
    input: {
      ...getMerchantRouteScope(request),
      ...query,
    },
  })

  response.status(200).json(result)
}

export const POST = async (
  request: AuthenticatedMedusaRequest<CreateMerchantCustomerBody>,
  response: MedusaResponse
) => {
  requireMerchantRole(request, ["owner", "admin"])
  const { result } = await createMerchantCustomerWorkflow(request.scope).run({
    input: {
      ...getMerchantRouteScope(request),
      actor_id: request.auth_context.actor_id,
      customer: request.validatedBody.customer,
      segment_ids: request.validatedBody.segment_ids,
    },
  })

  await recordMerchantActivity(request, {
    action: "customer.created",
    resource_type: "customer",
    resource_id: result.id,
    description: `Created customer ${result.email ?? result.id}`,
  })
  response.status(201).json({ customer: result })
}
