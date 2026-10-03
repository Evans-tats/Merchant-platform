import type { CreateStockLocationInput } from "@medusajs/framework/types"
import type {
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import { getMerchantRouteScope } from "../../../../../utils/merchant-route-scope"
import { requireMerchantRole } from "../../../../../utils/merchant-request-context"
import { createMerchantStockLocationsWorkflow } from "../../../../../../workflows/merchant-inventory"
import { recordMerchantActivity } from "../../../../../utils/record-merchant-activity"

type CreateLocationsBody = {
  locations: CreateStockLocationInput[]
}

export const POST = async (
  request: MedusaRequest<CreateLocationsBody>,
  response: MedusaResponse
) => {
  requireMerchantRole(request, ["owner", "admin"])
  const { result } = await createMerchantStockLocationsWorkflow(
    request.scope
  ).run({
    input: {
      ...getMerchantRouteScope(request),
      locations: request.validatedBody.locations,
    },
  })

  await Promise.all(result.map((location) => recordMerchantActivity(request, {
    action: "inventory.location_created",
    resource_type: "stock_location",
    resource_id: location.id,
    description: `Created stock location ${location.name}`,
  })))

  response.status(201).json({ stock_locations: result })
}
