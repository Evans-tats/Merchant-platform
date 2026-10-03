import type { UpdateStockLocationInput } from "@medusajs/framework/types"
import type {
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import { getMerchantRouteScope } from "../../../../../../utils/merchant-route-scope"
import { requireMerchantRole } from "../../../../../../utils/merchant-request-context"
import { updateMerchantStockLocationWorkflow } from "../../../../../../../workflows/merchant-inventory"
import { recordMerchantActivity } from "../../../../../../utils/record-merchant-activity"

type UpdateLocationBody = {
  update: UpdateStockLocationInput
}

export const POST = async (
  request: MedusaRequest<UpdateLocationBody>,
  response: MedusaResponse
) => {
  requireMerchantRole(request, ["owner", "admin"])
  const { result } = await updateMerchantStockLocationWorkflow(
    request.scope
  ).run({
    input: {
      ...getMerchantRouteScope(request),
      location_id: request.params.locationId,
      update: request.validatedBody.update,
    },
  })

  await recordMerchantActivity(request, {
    action: "inventory.location_updated",
    resource_type: "stock_location",
    resource_id: request.params.locationId,
    description: `Updated stock location ${request.params.locationId}`,
  })

  response.status(200).json({ stock_location: result[0] })
}
