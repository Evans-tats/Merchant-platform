import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import { requireMerchantRole } from "../../../../../utils/merchant-request-context"
import { getMerchantRouteScope } from "../../../../../utils/merchant-route-scope"
import { recordMerchantActivity } from "../../../../../utils/record-merchant-activity"
import {
  deleteMerchantCategoryWorkflow,
  retrieveMerchantCategoryWorkflow,
  updateMerchantCategoryWorkflow,
} from "../../../../../../workflows/merchant-categories"
import type { UpdateMerchantCategoryBody } from "../middlewares"

export const GET = async (
  request: AuthenticatedMedusaRequest,
  response: MedusaResponse
) => {
  const { result } = await retrieveMerchantCategoryWorkflow(
    request.scope
  ).run({
    input: {
      ...getMerchantRouteScope(request),
      category_id: request.params.categoryId,
    },
  })

  response.status(200).json({ product_category: result })
}

export const POST = async (
  request: AuthenticatedMedusaRequest<UpdateMerchantCategoryBody>,
  response: MedusaResponse
) => {
  requireMerchantRole(request, ["owner", "admin"])
  const { result } = await updateMerchantCategoryWorkflow(
    request.scope
  ).run({
    input: {
      ...getMerchantRouteScope(request),
      category_id: request.params.categoryId,
      update: request.validatedBody,
    },
  })

  await recordMerchantActivity(request, {
    action: "catalog.category_updated",
    resource_type: "product_category",
    resource_id: result.id,
    description: `Updated category ${result.name}`,
  })
  response.status(200).json({ product_category: result })
}

export const DELETE = async (
  request: AuthenticatedMedusaRequest,
  response: MedusaResponse
) => {
  requireMerchantRole(request, ["owner", "admin"])
  const { result } = await deleteMerchantCategoryWorkflow(
    request.scope
  ).run({
    input: {
      ...getMerchantRouteScope(request),
      category_id: request.params.categoryId,
    },
  })

  await recordMerchantActivity(request, {
    action: "catalog.category_deleted",
    resource_type: "product_category",
    resource_id: request.params.categoryId,
    description: "Deleted a category",
  })
  response.status(200).json(result)
}
