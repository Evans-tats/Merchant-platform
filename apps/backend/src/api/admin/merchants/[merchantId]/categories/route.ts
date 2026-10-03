import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import { getMerchantRouteScope } from "../../../../utils/merchant-route-scope"
import { requireMerchantRole } from "../../../../utils/merchant-request-context"
import {
  createMerchantCategoriesWorkflow,
  listMerchantCategoriesWorkflow,
} from "../../../../../workflows/merchant-categories"
import { recordMerchantActivity } from "../../../../utils/record-merchant-activity"
import type { CreateMerchantCategoriesBody } from "./middlewares"

export const GET = async (
  request: AuthenticatedMedusaRequest,
  response: MedusaResponse
) => {
  const { result } = await listMerchantCategoriesWorkflow(
    request.scope
  ).run({ input: getMerchantRouteScope(request) })

  response.status(200).json(result)
}

export const POST = async (
  request: AuthenticatedMedusaRequest<CreateMerchantCategoriesBody>,
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

  await Promise.all(result.map((category) => recordMerchantActivity(request, {
    action: "catalog.category_created",
    resource_type: "product_category",
    resource_id: category.id,
    description: `Created category ${category.name}`,
  })))

  response.status(201).json({ product_categories: result })
}
