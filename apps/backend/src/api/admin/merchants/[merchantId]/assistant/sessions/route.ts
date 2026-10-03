import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import { STORE_ASSISTANT_AGENT_TYPE } from "../../../../../../services/store-assistant/prompt"
import { listAssistantSessionsWorkflow } from "../../../../../../workflows/store-assistant"
import { getMerchantRouteScope } from "../../../../../utils/merchant-route-scope"

// The signed-in member's own conversations with the store assistant.
export const GET = async (
  request: AuthenticatedMedusaRequest,
  response: MedusaResponse
) => {
  const { result } = await listAssistantSessionsWorkflow(request.scope).run({
    input: {
      ...getMerchantRouteScope(request),
      actor_id: request.auth_context.actor_id,
      agent_type: STORE_ASSISTANT_AGENT_TYPE,
    },
  })

  response.status(200).json({ sessions: result })
}
