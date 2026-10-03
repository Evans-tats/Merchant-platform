import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import { getMerchantRouteScope } from "../../../../utils/merchant-route-scope"
import { requireMerchantRole } from "../../../../utils/merchant-request-context"
import {
  createMerchantCollectionsWorkflow,
  listMerchantCollectionsWorkflow,
} from "../../../../../workflows/merchant-collections"
import { recordMerchantActivity } from "../../../../utils/record-merchant-activity"
import type { CreateMerchantCollectionsBody } from "./middlewares"

export const GET = async (
  request: AuthenticatedMedusaRequest,
  response: MedusaResponse
) => {
  const { result } = await listMerchantCollectionsWorkflow(
    request.scope
  ).run({ input: getMerchantRouteScope(request) })

  response.status(200).json(result)
}

export const POST = async (
  request: AuthenticatedMedusaRequest<CreateMerchantCollectionsBody>,
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

  await Promise.all(result.map((collection) => recordMerchantActivity(request, {
    action: "catalog.collection_created",
    resource_type: "product_collection",
    resource_id: collection.id,
    description: `Created collection ${collection.title}`,
  })))

  response.status(201).json({ collections: result })
}
