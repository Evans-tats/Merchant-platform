import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import { getMerchantRouteScope } from "../../../../utils/merchant-route-scope"
import { isProductPhotoDraftEnabled } from "../../../../../services/product-photo-draft/draft-product-photo"
import { generateProductDraftFromPhotoWorkflow } from "../../../../../workflows/merchant-catalog"

// Lets the admin hide photo drafting when no model key is configured.
export const GET = async (
  _request: AuthenticatedMedusaRequest,
  response: MedusaResponse
) => {
  response.status(200).json({ enabled: isProductPhotoDraftEnabled() })
}

export const POST = async (
  request: AuthenticatedMedusaRequest,
  response: MedusaResponse
) => {
  const photos = Array.isArray(request.files) ? request.files : []
  const { result } = await generateProductDraftFromPhotoWorkflow(
    request.scope
  ).run({
    input: {
      ...getMerchantRouteScope(request),
      actor_id: request.auth_context.actor_id,
      files: photos.map((photo) => ({
        filename: photo.originalname,
        mimeType: photo.mimetype,
        content: photo.buffer.toString("base64"),
        size: photo.size,
      })),
    },
  })

  response.status(200).json({ draft: result })
}
