import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"

import {
  STORE_ASSISTANT_AGENT_TYPE,
  buildStoreAssistantPrompt,
} from "../../../../../services/store-assistant/prompt"
import { createProposalRecorder } from "../../../../../services/store-assistant/proposals"
import {
  StoreAssistantError,
  isStoreAssistantEnabled,
  runStoreAssistant,
} from "../../../../../services/store-assistant/run-store-assistant"
import {
  createAssistantProposalWorkflow,
  saveAssistantReplyWorkflow,
  startAssistantTurnWorkflow,
} from "../../../../../workflows/store-assistant"
import { getStaffMerchantContext } from "../../../../utils/merchant-request-context"
import { getMerchantRouteScope } from "../../../../utils/merchant-route-scope"
import type { PostStoreAssistantMessageSchema } from "./middlewares"

// Lets the admin explain the assistant is off when no model key is set.
export const GET = async (
  _request: AuthenticatedMedusaRequest,
  response: MedusaResponse
) => {
  response.status(200).json({ enabled: isStoreAssistantEnabled() })
}

// Answers one message. The reply streams back as NDJSON: a session_id line
// first, then text, tool_call, tool_result and proposal lines, then done or
// error.
export const POST = async (
  request: AuthenticatedMedusaRequest<PostStoreAssistantMessageSchema>,
  response: MedusaResponse
) => {
  if (!isStoreAssistantEnabled()) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "The store assistant isn't set up. Add GEMINI_API_KEY to the backend environment."
    )
  }

  const staff = getStaffMerchantContext(request)
  const scope = getMerchantRouteScope(request)
  const owner = {
    ...scope,
    actor_id: request.auth_context.actor_id,
    agent_type: STORE_ASSISTANT_AGENT_TYPE,
  }
  const { result: turn } = await startAssistantTurnWorkflow(
    request.scope
  ).run({
    input: {
      ...owner,
      session_id: request.validatedBody.session_id,
      message: request.validatedBody.message,
    },
  })

  response.setHeader("Content-Type", "application/x-ndjson")
  response.setHeader("Transfer-Encoding", "chunked")
  response.setHeader("Cache-Control", "no-cache")
  response.status(200)

  const emit = (event: object) => {
    if (!response.writableEnded && !response.destroyed) {
      response.write(JSON.stringify(event) + "\n")
    }
  }

  emit({ type: "session_id", session_id: turn.session_id })

  const proposals = createProposalRecorder({
    save: async (proposal) => {
      const { result } = await createAssistantProposalWorkflow(
        request.scope
      ).run({
        input: { ...owner, session_id: turn.session_id, ...proposal },
      })
      return result
    },
    emit,
  })
  let text = ""
  let failure: unknown

  try {
    const reply = await runStoreAssistant({
      history: turn.history,
      systemInstruction: buildStoreAssistantPrompt({
        merchant_name: staff.merchant.name,
      }),
      toolContext: {
        container: request.scope,
        ...scope,
        role: staff.member.role,
        propose: proposals.propose,
      },
      emit,
    })
    text = reply.text
  } catch (error) {
    failure = error
  }

  // A reply is kept when it has text or suggestion cards. After a failure
  // only the cards are kept, so they're still there when the chat reopens.
  try {
    if (text.trim() || proposals.ids.length) {
      await saveAssistantReplyWorkflow(request.scope).run({
        input: {
          ...owner,
          session_id: turn.session_id,
          content: text,
          proposal_ids: proposals.ids,
        },
      })
    }
  } catch (error) {
    failure ??= error
  }

  if (failure) {
    const logger = request.scope.resolve(ContainerRegistrationKeys.LOGGER)
    logger.error(
      `Store assistant failed: ${failure instanceof Error ? failure.message : String(failure)}`
    )
    emit({
      type: "error",
      message:
        failure instanceof StoreAssistantError && failure.reason === "unavailable"
          ? "The assistant is busy right now. Try again in a minute."
          : "Something went wrong while answering. Try again.",
    })
  } else {
    emit({ type: "done" })
  }

  response.end()
}
