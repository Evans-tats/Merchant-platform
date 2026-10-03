import type { ProductTypes } from "@medusajs/framework/types"
import type {
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import { getMerchantRouteScope } from "../../../../utils/merchant-route-scope"
import { requireMerchantRole } from "../../../../utils/merchant-request-context"
import { createMerchantCollectionsWorkflow } from "../../../../../workflows/merchant-catalog"
import { retrieveMerchantManagementWorkflow } from "../../../../../workflows/merchant-management"
import { recordMerchantActivity } from "../../../../utils/record-merchant-activity"

type CreateCollectionsBody = {
  collections: ProductTypes.CreateProductCollectionDTO[]
}

export const GET = async (
  request: MedusaRequest,
  response: MedusaResponse
) => {
  const { result } = await retrieveMerchantManagementWorkflow(
    request.scope
  ).run({ input: getMerchantRouteScope(request) })
  const collections =
    (result as Record<string, unknown>).product_collections ?? []

  response.status(200).json({ collections })
}

export const POST = async (
  request: MedusaRequest<CreateCollectionsBody>,
  response: MedusaResponse
) => {
  requireMerchantRole(request, ["owner", "admin"])
  const { result } = await createMerchantCollectionsWorkflow(
    request.scope
  ).run({
    input: {
      ...getMerchantRouteScope(request),
      collections: request.validatedBody.collections,
    },
  })

  await recordMerchantActivity(request, {
    action: "catalog.collections_created",
    resource_type: "product_collection",
    description: `Created ${result.length} product collections`,
  })

  response.status(201).json({ collections: result })
}
