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
import {
  StoreAssistantError,
  isStoreAssistantEnabled,
  runStoreAssistant,
} from "../../../../../services/store-assistant/run-store-assistant"
import {
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
// first, then text, tool_call and tool_result lines, then done or error.
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

  try {
    const reply = await runStoreAssistant({
      history: turn.history,
      systemInstruction: buildStoreAssistantPrompt({
        merchant_name: getStaffMerchantContext(request).merchant.name,
      }),
      toolContext: { container: request.scope, ...scope },
      emit,
    })

    if (reply.text.trim()) {
      await saveAssistantReplyWorkflow(request.scope).run({
        input: {
          ...owner,
          session_id: turn.session_id,
          content: reply.text,
        },
      })
    }

    emit({ type: "done" })
  } catch (error) {
    const logger = request.scope.resolve(ContainerRegistrationKeys.LOGGER)
    logger.error(
      `Store assistant failed: ${error instanceof Error ? error.message : String(error)}`
    )
    emit({
      type: "error",
      message:
        error instanceof StoreAssistantError && error.reason === "unavailable"
          ? "The assistant is busy right now. Try again in a minute."
          : "Something went wrong while answering. Try again.",
    })
  }

  response.end()
}
