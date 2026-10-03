import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import { requireMerchantRole } from "../../../../../../utils/merchant-request-context"
import { getMerchantRouteScope } from "../../../../../../utils/merchant-route-scope"
import { recordMerchantActivity } from "../../../../../../utils/record-merchant-activity"
import { manageMerchantCustomerSegmentsWorkflow } from "../../../../../../../workflows/merchant-customer-segments"
import type { ManageMerchantCustomerSegmentsBody } from "../../middlewares"

export const POST = async (
  request: AuthenticatedMedusaRequest<ManageMerchantCustomerSegmentsBody>,
  response: MedusaResponse
) => {
  requireMerchantRole(request, ["owner", "admin"])
  const { result } = await manageMerchantCustomerSegmentsWorkflow(
    request.scope
  ).run({
    input: {
      ...getMerchantRouteScope(request),
      customer_id: request.params.customerId,
      add: request.validatedBody.add,
      remove: request.validatedBody.remove,
    },
  })

  await recordMerchantActivity(request, {
    action: "customer.segments_updated",
    resource_type: "customer",
    resource_id: request.params.customerId,
    description: "Updated customer segments",
    metadata: {
      added: request.validatedBody.add ?? [],
      removed: request.validatedBody.remove ?? [],
    },
  })
  response.status(200).json({ segments: result })
}
