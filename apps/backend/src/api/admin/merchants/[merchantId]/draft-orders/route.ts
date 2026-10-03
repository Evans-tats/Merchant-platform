import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"

import { requireMerchantRole } from "../../../../utils/merchant-request-context"
import { getMerchantRouteScope } from "../../../../utils/merchant-route-scope"
import { recordMerchantActivity } from "../../../../utils/record-merchant-activity"
import { createMerchantDraftOrderWorkflow } from "../../../../../workflows/merchant-draft-orders"
import { retrieveMerchantManagementWorkflow } from "../../../../../workflows/merchant-management"

type CreateDraftOrderBody = {
  email: string
  items: Array<{ variant_id: string; quantity: number }>
}

export const GET = async (
  request: AuthenticatedMedusaRequest,
  response: MedusaResponse
) => {
  const { result } = await retrieveMerchantManagementWorkflow(request.scope).run({
    input: getMerchantRouteScope(request),
  })
  const orders = ((result as Record<string, unknown>).orders ?? []) as Array<{
    status?: string
  }>

  response.status(200).json({
    draft_orders: orders.filter(({ status }) => status === "draft"),
  })
}

export const POST = async (
  request: AuthenticatedMedusaRequest<CreateDraftOrderBody>,
  response: MedusaResponse
) => {
  requireMerchantRole(request, ["owner", "admin"])
  const { result } = await createMerchantDraftOrderWorkflow(request.scope).run({
    input: {
      ...getMerchantRouteScope(request),
      actor_id: request.auth_context.actor_id,
      email: request.validatedBody.email,
      items: request.validatedBody.items,
    },
  })

  await recordMerchantActivity(request, {
    action: "draft_order.created",
    resource_type: "order",
    resource_id: result.id,
    description: `Created draft order ${result.id}`,
  })
  response.status(201).json({ draft_order: result })
}
