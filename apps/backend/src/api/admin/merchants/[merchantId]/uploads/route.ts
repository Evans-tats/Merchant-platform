import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import { getMerchantRouteScope } from "../../../../utils/merchant-route-scope"
import { uploadMerchantProductMediaFromAdminWorkflow } from "../../../../../workflows/merchant-catalog"

export const POST = async (
  request: AuthenticatedMedusaRequest,
  response: MedusaResponse
) => {
  const files = Array.isArray(request.files) ? request.files : []
  const { result } = await uploadMerchantProductMediaFromAdminWorkflow(
    request.scope
  ).run({
    input: {
      ...getMerchantRouteScope(request),
      actor_id: request.auth_context.actor_id,
      files: files.map((file) => ({
        filename: file.originalname,
        mimeType: file.mimetype,
        content: file.buffer.toString("base64"),
        size: file.size,
      })),
    },
  })

  response.status(200).json({ files: result })
}
