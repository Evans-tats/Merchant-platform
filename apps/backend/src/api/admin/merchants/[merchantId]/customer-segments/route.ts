import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import { requireMerchantRole } from "../../../../utils/merchant-request-context"
import { getMerchantRouteScope } from "../../../../utils/merchant-route-scope"
import { recordMerchantActivity } from "../../../../utils/record-merchant-activity"
import {
  createMerchantCustomerSegmentWorkflow,
  listMerchantCustomerSegmentsWorkflow,
} from "../../../../../workflows/merchant-customer-segments"
import type {
  CreateMerchantCustomerSegmentBody,
  ListMerchantCustomerSegmentsQuery,
} from "./middlewares"

export const GET = async (
  request: AuthenticatedMedusaRequest,
  response: MedusaResponse
) => {
  const query = request.validatedQuery as ListMerchantCustomerSegmentsQuery
  const { result } = await listMerchantCustomerSegmentsWorkflow(
    request.scope
  ).run({
    input: {
      ...getMerchantRouteScope(request),
      ...query,
    },
  })

  response.status(200).json(result)
}

export const POST = async (
  request: AuthenticatedMedusaRequest<CreateMerchantCustomerSegmentBody>,
  response: MedusaResponse
) => {
  requireMerchantRole(request, ["owner", "admin"])
  const { result } = await createMerchantCustomerSegmentWorkflow(
    request.scope
  ).run({
    input: {
      ...getMerchantRouteScope(request),
      actor_id: request.auth_context.actor_id,
      segment: request.validatedBody,
    },
  })

  await recordMerchantActivity(request, {
    action: "customer_segment.created",
    resource_type: "customer_segment",
    resource_id: result.id,
    description: `Created customer segment ${result.name}`,
  })
  response.status(201).json({ customer_segment: result })
}
