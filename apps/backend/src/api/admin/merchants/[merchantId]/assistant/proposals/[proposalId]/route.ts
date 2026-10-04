import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import { STORE_ASSISTANT_AGENT_TYPE } from "../../../../../../../services/store-assistant/prompt"
import { resolveAssistantProposalWorkflow } from "../../../../../../../workflows/store-assistant"
import { getMerchantRouteScope } from "../../../../../../utils/merchant-route-scope"
import type { ResolveStoreAssistantProposalSchema } from "../../middlewares"

// Records what the member did with a suggestion card. Approving doesn't run
// the change here: the dashboard calls the change's own merchant route first,
// with its usual role checks and activity log, then reports the outcome.
export const POST = async (
  request: AuthenticatedMedusaRequest<ResolveStoreAssistantProposalSchema>,
  response: MedusaResponse
) => {
  const { result } = await resolveAssistantProposalWorkflow(
    request.scope
  ).run({
    input: {
      ...getMerchantRouteScope(request),
      actor_id: request.auth_context.actor_id,
      agent_type: STORE_ASSISTANT_AGENT_TYPE,
      proposal_id: request.params.proposalId,
      status: request.validatedBody.status,
      error: request.validatedBody.error,
      edits: request.validatedBody.edits,
    },
  })

  response.status(200).json({ proposal: result })
}
