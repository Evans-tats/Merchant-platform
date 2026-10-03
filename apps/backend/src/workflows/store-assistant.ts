import { MedusaError } from "@medusajs/framework/utils"
import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"

import { AGENT_MODULE } from "../modules/agent"
import type AgentModuleService from "../modules/agent/service"
import {
  type MerchantScopeInput,
  validateMerchantScopeStep,
} from "./steps/validate-merchant-commerce"

// Earlier messages sent back to the model on each turn. Older ones are
// dropped to keep requests small.
export const ASSISTANT_HISTORY_LIMIT = 40

type SessionOwner = {
  merchant_id: string
  actor_id: string
  agent_type: string
}

export type AssistantHistoryMessage = {
  role: "user" | "assistant"
  content: string
}

const sessionTitle = (message: string) => {
  const line = message.trim().split("\n")[0]
  return line.length > 72 ? `${line.slice(0, 71)}…` : line
}

// Sessions are private to the member who started them, inside one merchant.
// Anything else reads as "not found" so ids from other merchants leak nothing.
const retrieveOwnedSession = async (
  service: AgentModuleService,
  sessionId: string,
  owner: SessionOwner
) => {
  const [session] = await service.listAgentSessions({
    id: sessionId,
    merchant_id: owner.merchant_id,
    created_by_id: owner.actor_id,
    agent_type: owner.agent_type,
  })

  if (!session) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "Conversation not found"
    )
  }

  return session
}

const listRecentMessages = async (
  service: AgentModuleService,
  sessionId: string
): Promise<AssistantHistoryMessage[]> => {
  const messages = await service.listAgentMessages(
    { session_id: sessionId },
    {
      select: ["role", "content", "created_at"],
      order: { created_at: "DESC" },
      take: ASSISTANT_HISTORY_LIMIT,
    }
  )

  return messages.reverse().map(({ role, content }) => ({ role, content }))
}

const startAssistantTurnStep = createStep(
  "start-assistant-turn",
  async (
    input: SessionOwner & { session_id?: string; message: string },
    { container }
  ) => {
    const service = container.resolve<AgentModuleService>(AGENT_MODULE)
    let createdSessionId: string | undefined
    let sessionId = input.session_id

    if (sessionId) {
      await retrieveOwnedSession(service, sessionId, input)
    } else {
      const session = await service.createAgentSessions({
        agent_type: input.agent_type,
        merchant_id: input.merchant_id,
        created_by_id: input.actor_id,
        title: sessionTitle(input.message),
      })
      sessionId = session.id
      createdSessionId = session.id
    }

    const history = await listRecentMessages(service, sessionId)
    const message = await service.createAgentMessages({
      session_id: sessionId,
      role: "user",
      content: input.message,
    })

    return new StepResponse(
      {
        session_id: sessionId,
        history: [
          ...history,
          { role: "user" as const, content: input.message },
        ].slice(-ASSISTANT_HISTORY_LIMIT),
      },
      { session_id: createdSessionId, message_id: message.id }
    )
  },
  async (created, { container }) => {
    if (!created) {
      return
    }

    const service = container.resolve<AgentModuleService>(AGENT_MODULE)

    if (created.session_id) {
      await service.deleteAgentSessions(created.session_id)
      return
    }

    await service.deleteAgentMessages(created.message_id)
  }
)

const saveAssistantReplyStep = createStep(
  "save-assistant-reply",
  async (
    input: SessionOwner & { session_id: string; content: string },
    { container }
  ) => {
    const service = container.resolve<AgentModuleService>(AGENT_MODULE)

    await retrieveOwnedSession(service, input.session_id, input)
    const message = await service.createAgentMessages({
      session_id: input.session_id,
      role: "assistant",
      content: input.content,
    })

    return new StepResponse({ id: message.id }, message.id)
  },
  async (messageId, { container }) => {
    if (!messageId) {
      return
    }

    const service = container.resolve<AgentModuleService>(AGENT_MODULE)
    await service.deleteAgentMessages(messageId)
  }
)

const listAssistantSessionsStep = createStep(
  "list-assistant-sessions",
  async (input: SessionOwner, { container }) => {
    const service = container.resolve<AgentModuleService>(AGENT_MODULE)
    const sessions = await service.listAgentSessions(
      {
        merchant_id: input.merchant_id,
        created_by_id: input.actor_id,
        agent_type: input.agent_type,
      },
      {
        select: ["id", "title", "created_at"],
        order: { created_at: "DESC" },
        take: 50,
      }
    )

    return new StepResponse(sessions)
  }
)

const retrieveAssistantSessionStep = createStep(
  "retrieve-assistant-session",
  async (input: SessionOwner & { session_id: string }, { container }) => {
    const service = container.resolve<AgentModuleService>(AGENT_MODULE)
    const session = await retrieveOwnedSession(
      service,
      input.session_id,
      input
    )
    const messages = await service.listAgentMessages(
      { session_id: session.id },
      {
        select: ["id", "role", "content", "created_at"],
        order: { created_at: "ASC" },
      }
    )

    return new StepResponse({
      id: session.id,
      title: session.title,
      created_at: session.created_at,
      messages,
    })
  }
)

type AssistantScopeInput = MerchantScopeInput & {
  actor_id: string
  agent_type: string
}

// Opens a new conversation or continues one, stores the merchant's message,
// and returns the history to send to the model.
export const startAssistantTurnWorkflow = createWorkflow(
  "start-assistant-turn",
  function (
    input: AssistantScopeInput & { session_id?: string; message: string }
  ) {
    const scope = validateMerchantScopeStep(input)
    const turn = startAssistantTurnStep({
      merchant_id: scope.merchant_id,
      actor_id: input.actor_id,
      agent_type: input.agent_type,
      session_id: input.session_id,
      message: input.message,
    })

    return new WorkflowResponse(turn)
  }
)

export const saveAssistantReplyWorkflow = createWorkflow(
  "save-assistant-reply",
  function (
    input: AssistantScopeInput & { session_id: string; content: string }
  ) {
    const scope = validateMerchantScopeStep(input)
    const message = saveAssistantReplyStep({
      merchant_id: scope.merchant_id,
      actor_id: input.actor_id,
      agent_type: input.agent_type,
      session_id: input.session_id,
      content: input.content,
    })

    return new WorkflowResponse(message)
  }
)

export const listAssistantSessionsWorkflow = createWorkflow(
  "list-assistant-sessions",
  function (input: AssistantScopeInput) {
    const scope = validateMerchantScopeStep(input)
    const sessions = listAssistantSessionsStep({
      merchant_id: scope.merchant_id,
      actor_id: input.actor_id,
      agent_type: input.agent_type,
    })

    return new WorkflowResponse(sessions)
  }
)

export const retrieveAssistantSessionWorkflow = createWorkflow(
  "retrieve-assistant-session",
  function (input: AssistantScopeInput & { session_id: string }) {
    const scope = validateMerchantScopeStep(input)
    const session = retrieveAssistantSessionStep({
      merchant_id: scope.merchant_id,
      actor_id: input.actor_id,
      agent_type: input.agent_type,
      session_id: input.session_id,
    })

    return new WorkflowResponse(session)
  }
)
