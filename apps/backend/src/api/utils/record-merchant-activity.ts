import type { MedusaRequest } from "@medusajs/framework/http"

import { recordMerchantActivityWorkflow } from "../../workflows/merchant-insights"
import { getStaffMerchantContext } from "./merchant-request-context"
import { getMerchantRouteScope } from "./merchant-route-scope"

export async function recordMerchantActivity(
  request: MedusaRequest,
  input: {
    action: string
    resource_type: string
    resource_id?: string | null
    description: string
    metadata?: Record<string, unknown>
    notification?: {
      type: string
      severity?: "info" | "warning" | "critical"
      title: string
      message: string
    }
  }
) {
  const context = getStaffMerchantContext(request)

  await recordMerchantActivityWorkflow(request.scope).run({
    input: {
      ...getMerchantRouteScope(request),
      actor_id: context.member.actor_id,
      ...input,
    },
  })
}
