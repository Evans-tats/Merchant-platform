import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import { requireMerchantRole } from "../../../../../../utils/merchant-request-context"
import { getMerchantRouteScope } from "../../../../../../utils/merchant-route-scope"
import { recordMerchantActivity } from "../../../../../../utils/record-merchant-activity"
import { manageMerchantCollectionProductsWorkflow } from "../../../../../../../workflows/merchant-collections"
import type { ManageMerchantCollectionProductsBody } from "../../middlewares"

export const POST = async (
  request: AuthenticatedMedusaRequest<ManageMerchantCollectionProductsBody>,
  response: MedusaResponse
) => {
  requireMerchantRole(request, ["owner", "admin"])
  const { result } = await manageMerchantCollectionProductsWorkflow(
    request.scope
  ).run({
    input: {
      ...getMerchantRouteScope(request),
      collection_id: request.params.collectionId,
      add: request.validatedBody.add,
      remove: request.validatedBody.remove,
    },
  })

  await recordMerchantActivity(request, {
    action: "catalog.collection_products_updated",
    resource_type: "product_collection",
    resource_id: result.id,
    description: `Updated products in collection ${result.title}`,
    metadata: {
      added: request.validatedBody.add?.length ?? 0,
      removed: request.validatedBody.remove?.length ?? 0,
    },
  })
  response.status(200).json({ collection: result })
}
