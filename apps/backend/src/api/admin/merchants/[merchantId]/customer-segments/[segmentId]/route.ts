import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import { requireMerchantRole } from "../../../../../utils/merchant-request-context"
import { getMerchantRouteScope } from "../../../../../utils/merchant-route-scope"
import { recordMerchantActivity } from "../../../../../utils/record-merchant-activity"
import {
  deleteMerchantCustomerSegmentWorkflow,
  retrieveMerchantCustomerSegmentWorkflow,
  updateMerchantCustomerSegmentWorkflow,
} from "../../../../../../workflows/merchant-customer-segments"
import type { UpdateMerchantCustomerSegmentBody } from "../middlewares"

export const GET = async (
  request: AuthenticatedMedusaRequest,
  response: MedusaResponse
) => {
  const { result } = await retrieveMerchantCustomerSegmentWorkflow(
    request.scope
  ).run({
    input: {
      ...getMerchantRouteScope(request),
      segment_id: request.params.segmentId,
    },
  })

  response.status(200).json({ customer_segment: result })
}

export const POST = async (
  request: AuthenticatedMedusaRequest<UpdateMerchantCustomerSegmentBody>,
  response: MedusaResponse
) => {
  requireMerchantRole(request, ["owner", "admin"])
  const { result } = await updateMerchantCustomerSegmentWorkflow(
    request.scope
  ).run({
    input: {
      ...getMerchantRouteScope(request),
      segment_id: request.params.segmentId,
      update: request.validatedBody,
    },
  })

  await recordMerchantActivity(request, {
    action: "customer_segment.updated",
    resource_type: "customer_segment",
    resource_id: result.id,
    description: `Updated customer segment ${result.name}`,
  })
  response.status(200).json({ customer_segment: result })
}

export const DELETE = async (
  request: AuthenticatedMedusaRequest,
  response: MedusaResponse
) => {
  requireMerchantRole(request, ["owner", "admin"])
  const { result } = await deleteMerchantCustomerSegmentWorkflow(
    request.scope
  ).run({
    input: {
      ...getMerchantRouteScope(request),
      segment_id: request.params.segmentId,
    },
  })

  await recordMerchantActivity(request, {
    action: "customer_segment.deleted",
    resource_type: "customer_segment",
    resource_id: request.params.segmentId,
    description: "Deleted a customer segment",
  })
  response.status(200).json(result)
}
