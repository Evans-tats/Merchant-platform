import type { ProductCategoryWorkflow } from "@medusajs/framework/types"
import type {
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import { getMerchantRouteScope } from "../../../../utils/merchant-route-scope"
import { requireMerchantRole } from "../../../../utils/merchant-request-context"
import { createMerchantCategoriesWorkflow } from "../../../../../workflows/merchant-catalog"
import { retrieveMerchantManagementWorkflow } from "../../../../../workflows/merchant-management"
import { recordMerchantActivity } from "../../../../utils/record-merchant-activity"

type CreateCategoriesBody = {
  product_categories:
    ProductCategoryWorkflow.CreateProductCategoriesWorkflowInput["product_categories"]
}

export const GET = async (
  request: MedusaRequest,
  response: MedusaResponse
) => {
  const { result } = await retrieveMerchantManagementWorkflow(
    request.scope
  ).run({ input: getMerchantRouteScope(request) })
  const categories =
    (result as Record<string, unknown>).product_categories ?? []

  response.status(200).json({ product_categories: categories })
}

export const POST = async (
  request: MedusaRequest<CreateCategoriesBody>,
  response: MedusaResponse
) => {
  requireMerchantRole(request, ["owner", "admin"])
  const { result } = await createMerchantCategoriesWorkflow(
    request.scope
  ).run({
    input: {
      ...getMerchantRouteScope(request),
      product_categories: request.validatedBody.product_categories,
    },
  })

  await recordMerchantActivity(request, {
    action: "catalog.categories_created",
    resource_type: "product_category",
    description: `Created ${result.length} product categories`,
  })

  response.status(201).json({ product_categories: result })
}
