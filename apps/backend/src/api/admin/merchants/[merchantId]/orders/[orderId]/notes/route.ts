import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import { getMerchantRouteScope } from "../../../../../../utils/merchant-route-scope"
import { recordMerchantActivity } from "../../../../../../utils/record-merchant-activity"
import { addMerchantOrderNoteWorkflow } from "../../../../../../../workflows/merchant-order-operations"

type NoteBody = { note: string }

export const POST = async (
  request: AuthenticatedMedusaRequest<NoteBody>,
  response: MedusaResponse
) => {
  const { result } = await addMerchantOrderNoteWorkflow(request.scope).run({
    input: {
      ...getMerchantRouteScope(request),
      order_id: request.params.orderId,
      actor_id: request.auth_context.actor_id,
      note: request.validatedBody.note,
    },
  })

  await recordMerchantActivity(request, {
    action: "order.note_added",
    resource_type: "order",
    resource_id: request.params.orderId,
    description: "Added an internal order note",
  })
  response.status(200).json({ order: result })
}
