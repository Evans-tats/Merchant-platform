import type {
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import { resolvePublicStorefrontConfiguration } from "../../../services/tenant-resolution"

export const GET = async (
  request: MedusaRequest,
  response: MedusaResponse
) => {
  const queryHostname = request.query.hostname
  const hostname =
    typeof queryHostname === "string"
      ? queryHostname
      : request.get("x-storefront-host") ?? request.get("host") ?? ""
  const configuration = await resolvePublicStorefrontConfiguration(
    request.scope,
    hostname
  )

  response.setHeader("Cache-Control", "private, no-store")
  response.status(200).json({ configuration })
}
