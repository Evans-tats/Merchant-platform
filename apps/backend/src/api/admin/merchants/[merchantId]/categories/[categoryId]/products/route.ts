import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import { requireMerchantRole } from "../../../../../../utils/merchant-request-context"
import { getMerchantRouteScope } from "../../../../../../utils/merchant-route-scope"
import { recordMerchantActivity } from "../../../../../../utils/record-merchant-activity"
import { manageMerchantCategoryProductsWorkflow } from "../../../../../../../workflows/merchant-categories"
import type { ManageMerchantCategoryProductsBody } from "../../middlewares"

export const POST = async (
  request: AuthenticatedMedusaRequest<ManageMerchantCategoryProductsBody>,
  response: MedusaResponse
) => {
  requireMerchantRole(request, ["owner", "admin"])
  const { result } = await manageMerchantCategoryProductsWorkflow(
    request.scope
  ).run({
    input: {
      ...getMerchantRouteScope(request),
      category_id: request.params.categoryId,
      add: request.validatedBody.add,
      remove: request.validatedBody.remove,
    },
  })

  await recordMerchantActivity(request, {
    action: "catalog.category_products_updated",
    resource_type: "product_category",
    resource_id: result.id,
    description: `Updated products in category ${result.name}`,
    metadata: {
      added: request.validatedBody.add?.length ?? 0,
      removed: request.validatedBody.remove?.length ?? 0,
    },
  })
  response.status(200).json({ product_category: result })
}
