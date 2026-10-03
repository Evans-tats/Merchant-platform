import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import { STORE_ASSISTANT_AGENT_TYPE } from "../../../../../../../services/store-assistant/prompt"
import { retrieveAssistantSessionWorkflow } from "../../../../../../../workflows/store-assistant"
import { getMerchantRouteScope } from "../../../../../../utils/merchant-route-scope"

export const GET = async (
  request: AuthenticatedMedusaRequest,
  response: MedusaResponse
) => {
  const { result } = await retrieveAssistantSessionWorkflow(
    request.scope
  ).run({
    input: {
      ...getMerchantRouteScope(request),
      actor_id: request.auth_context.actor_id,
      agent_type: STORE_ASSISTANT_AGENT_TYPE,
      session_id: request.params.sessionId,
    },
  })

  response.status(200).json({ session: result })
}
