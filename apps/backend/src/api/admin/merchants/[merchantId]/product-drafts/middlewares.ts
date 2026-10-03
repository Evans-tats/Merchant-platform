import {
  type MedusaNextFunction,
  type MedusaRequest,
  type MedusaResponse,
  type MiddlewareRoute,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import multer from "multer"

import { MAX_DRAFT_PHOTOS } from "../../../../../services/product-photo-draft/draft-product-photo"
import { requireMerchantRole } from "../../../../utils/merchant-request-context"

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: MAX_DRAFT_PHOTOS,
  },
}).array("photos", MAX_DRAFT_PHOTOS)

const requireMerchantCatalogManager = (
  request: MedusaRequest,
  _response: MedusaResponse,
  next: MedusaNextFunction
) => {
  requireMerchantRole(request, ["owner", "admin"])
  next()
}

// Turns multer's limit errors into a 400 the admin can show, instead of an
// unknown server error.
const acceptDraftPhotos = (
  request: MedusaRequest,
  response: MedusaResponse,
  next: MedusaNextFunction
) => {
  upload(request, response, (error?: unknown) => {
    if (error instanceof multer.MulterError) {
      next(new MedusaError(
        MedusaError.Types.INVALID_DATA,
        error.code === "LIMIT_FILE_SIZE"
          ? "Each photo must be 10 MB or smaller"
          : `Send up to ${MAX_DRAFT_PHOTOS} photos for one draft`
      ))
      return
    }

    next(error)
  })
}

export const merchantProductDraftMiddlewares: MiddlewareRoute[] = [
  {
    matcher: "/admin/merchants/:merchantId/product-drafts",
    methods: ["POST"],
    middlewares: [
      requireMerchantCatalogManager,
      acceptDraftPhotos,
    ],
  },
]
