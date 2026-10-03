import type { MedusaRequest } from "@medusajs/framework/http"

import { getStaffMerchantContext } from "./merchant-request-context"

export function getMerchantRouteScope(request: MedusaRequest) {
  const context = getStaffMerchantContext(request)

  return {
    merchant_id: context.merchant.id,
    sales_channel_id: context.salesChannel.id,
  }
}
