import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import { requireMerchantRole } from "../../../../../../utils/merchant-request-context"
import { getMerchantRouteScope } from "../../../../../../utils/merchant-route-scope"
import { recordMerchantActivity } from "../../../../../../utils/record-merchant-activity"
import { manageMerchantCustomerSegmentCustomersWorkflow } from "../../../../../../../workflows/merchant-customer-segments"
import type { ManageMerchantCustomerSegmentCustomersBody } from "../../middlewares"

export const POST = async (
  request: AuthenticatedMedusaRequest<ManageMerchantCustomerSegmentCustomersBody>,
  response: MedusaResponse
) => {
  requireMerchantRole(request, ["owner", "admin"])
  const { result } = await manageMerchantCustomerSegmentCustomersWorkflow(
    request.scope
  ).run({
    input: {
      ...getMerchantRouteScope(request),
      segment_id: request.params.segmentId,
      add: request.validatedBody.add,
      remove: request.validatedBody.remove,
    },
  })

  await recordMerchantActivity(request, {
    action: "customer_segment.customers_updated",
    resource_type: "customer_segment",
    resource_id: result.id,
    description: `Updated customers in segment ${result.name}`,
    metadata: {
      added: request.validatedBody.add?.length ?? 0,
      removed: request.validatedBody.remove?.length ?? 0,
    },
  })
  response.status(200).json({ customer_segment: result })
}
