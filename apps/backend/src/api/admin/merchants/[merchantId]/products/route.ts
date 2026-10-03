import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import { getMerchantRouteScope } from "../../../../utils/merchant-route-scope"
import { recordMerchantActivity } from "../../../../utils/record-merchant-activity"
import {
  createMerchantProductsFromAdminWorkflow,
  listMerchantProductsWorkflow,
} from "../../../../../workflows/merchant-catalog"
import type {
  CreateMerchantProductsBody,
  ListMerchantProductsQuery,
} from "./middlewares"

export const GET = async (
  request: AuthenticatedMedusaRequest,
  response: MedusaResponse
) => {
  const query = request.validatedQuery as ListMerchantProductsQuery
  const { result } = await listMerchantProductsWorkflow(request.scope).run({
    input: {
      ...getMerchantRouteScope(request),
      ...query,
    },
  })

  response.status(200).json(result)
}

export const POST = async (
  request: AuthenticatedMedusaRequest<CreateMerchantProductsBody>,
  response: MedusaResponse
) => {
  const { result } = await createMerchantProductsFromAdminWorkflow(
    request.scope
  ).run({
    input: {
      ...getMerchantRouteScope(request),
      actor_id: request.auth_context.actor_id,
      products: request.validatedBody.products,
    },
  })

  await Promise.all(result.map((product) => recordMerchantActivity(request, {
    action: "product.created",
    resource_type: "product",
    resource_id: product.id,
    description: `Created product ${product.title}`,
  })))

  response.status(201).json({ products: result })
}
