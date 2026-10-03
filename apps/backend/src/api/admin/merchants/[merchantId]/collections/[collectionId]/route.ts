import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import { requireMerchantRole } from "../../../../../utils/merchant-request-context"
import { getMerchantRouteScope } from "../../../../../utils/merchant-route-scope"
import { recordMerchantActivity } from "../../../../../utils/record-merchant-activity"
import {
  deleteMerchantCollectionWorkflow,
  retrieveMerchantCollectionWorkflow,
  updateMerchantCollectionWorkflow,
} from "../../../../../../workflows/merchant-collections"
import type { UpdateMerchantCollectionBody } from "../middlewares"

export const GET = async (
  request: AuthenticatedMedusaRequest,
  response: MedusaResponse
) => {
  const { result } = await retrieveMerchantCollectionWorkflow(
    request.scope
  ).run({
    input: {
      ...getMerchantRouteScope(request),
      collection_id: request.params.collectionId,
    },
  })

  response.status(200).json({ collection: result })
}

export const POST = async (
  request: AuthenticatedMedusaRequest<UpdateMerchantCollectionBody>,
  response: MedusaResponse
) => {
  requireMerchantRole(request, ["owner", "admin"])
  const { result } = await updateMerchantCollectionWorkflow(
    request.scope
  ).run({
    input: {
      ...getMerchantRouteScope(request),
      collection_id: request.params.collectionId,
      update: request.validatedBody,
    },
  })

  await recordMerchantActivity(request, {
    action: "catalog.collection_updated",
    resource_type: "product_collection",
    resource_id: result.id,
    description: `Updated collection ${result.title}`,
  })
  response.status(200).json({ collection: result })
}

export const DELETE = async (
  request: AuthenticatedMedusaRequest,
  response: MedusaResponse
) => {
  requireMerchantRole(request, ["owner", "admin"])
  const { result } = await deleteMerchantCollectionWorkflow(
    request.scope
  ).run({
    input: {
      ...getMerchantRouteScope(request),
      collection_id: request.params.collectionId,
    },
  })

  await recordMerchantActivity(request, {
    action: "catalog.collection_deleted",
    resource_type: "product_collection",
    resource_id: request.params.collectionId,
    description: "Deleted a collection",
  })
  response.status(200).json(result)
}
