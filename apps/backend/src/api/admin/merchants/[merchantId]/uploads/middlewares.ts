import {
  type MedusaNextFunction,
  type MedusaRequest,
  type MedusaResponse,
  type MiddlewareRoute,
} from "@medusajs/framework/http"
import multer from "multer"

import { requireMerchantRole } from "../../../../utils/merchant-request-context"

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 20,
  },
})

const requireMerchantCatalogManager = (
  request: MedusaRequest,
  _response: MedusaResponse,
  next: MedusaNextFunction
) => {
  requireMerchantRole(request, ["owner", "admin"])
  next()
}

export const merchantUploadMiddlewares: MiddlewareRoute[] = [
  {
    matcher: "/admin/merchants/:merchantId/uploads",
    methods: ["POST"],
    middlewares: [
      requireMerchantCatalogManager,
      upload.array("files", 20),
    ],
  },
]
