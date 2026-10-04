import { MedusaError } from "@medusajs/framework/utils"
import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"

import { AGENT_MODULE } from "../modules/agent"
import type AgentModuleService from "../modules/agent/service"
import {
  parseProposalEdits,
  proposalHistoryLine,
  type NewStoreAssistantProposal,
  type StoreAssistantProposal,
  type StoreAssistantProposalAction,
  type StoreAssistantProposalStatus,
} from "../services/store-assistant/proposals"
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

const proposalFields = [
  "id",
  "message_id",
  "action",
  "args",
  "preview",
  "summary",
  "status",
  "error",
]

type ProposalRecord = {
  id: string
  message_id?: string | null
  action: string
  args: Record<string, unknown>
  preview: Record<string, unknown>
  summary: string
  status: string
  error?: string | null
}

const toProposal = (record: ProposalRecord): StoreAssistantProposal => ({
  id: record.id,
  action: record.action as StoreAssistantProposalAction,
  args: record.args,
  preview: record.preview,
  summary: record.summary,
  status: record.status as StoreAssistantProposalStatus,
  error: record.error ?? null,
})

// The suggestion cards of the given replies, oldest first, by reply id.
const listProposalsByMessage = async (
  service: AgentModuleService,
  sessionId: string,
  messageIds: string[]
) => {
  const byMessage = new Map<string, StoreAssistantProposal[]>()

  if (!messageIds.length) {
    return byMessage
  }

  const proposals = await service.listAgentProposals(
    { session_id: sessionId, message_id: messageIds },
    { select: proposalFields, order: { created_at: "ASC" } }
  )

  for (const proposal of proposals as ProposalRecord[]) {
    const messageId = proposal.message_id!
    byMessage.set(messageId, [
      ...(byMessage.get(messageId) ?? []),
      toProposal(proposal),
    ])
  }

  return byMessage
}

const listRecentMessages = async (
  service: AgentModuleService,
  sessionId: string
): Promise<AssistantHistoryMessage[]> => {
  const messages = await service.listAgentMessages(
    { session_id: sessionId },
    {
      select: ["id", "role", "content", "created_at"],
      order: { created_at: "DESC" },
      take: ASSISTANT_HISTORY_LIMIT,
    }
  )
  const proposals = await listProposalsByMessage(
    service,
    sessionId,
    messages.map(({ id }) => id)
  )

  // Each reply carries what happened to its suggestions, so the model
  // neither suggests them again nor calls a dismissed one done.
  return messages.reverse().map(({ id, role, content }) => ({
    role,
    content: [content, ...(proposals.get(id) ?? []).map(proposalHistoryLine)]
      .filter(Boolean)
      .join("\n\n"),
  }))
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

// Attaches the reply's suggestions to it, so they show again when the chat
// is reopened and go back to the model with the reply.
const linkAssistantProposalsStep = createStep(
  "link-assistant-proposals",
  async (
    input: { session_id: string; message_id: string; proposal_ids: string[] },
    { container }
  ) => {
    if (!input.proposal_ids.length) {
      return new StepResponse([] as string[], [] as string[])
    }

    const service = container.resolve<AgentModuleService>(AGENT_MODULE)
    const proposals = await service.listAgentProposals(
      {
        id: input.proposal_ids,
        session_id: input.session_id,
        message_id: null,
      },
      { select: ["id"] }
    )
    const ids = proposals.map(({ id }) => id)

    if (ids.length) {
      await service.updateAgentProposals(
        ids.map((id) => ({ id, message_id: input.message_id }))
      )
    }

    return new StepResponse(ids, ids)
  },
  async (ids, { container }) => {
    if (!ids?.length) {
      return
    }

    const service = container.resolve<AgentModuleService>(AGENT_MODULE)
    await service.updateAgentProposals(
      ids.map((id) => ({ id, message_id: null }))
    )
  }
)

const createAssistantProposalStep = createStep(
  "create-assistant-proposal",
  async (
    input: SessionOwner & { session_id: string } & NewStoreAssistantProposal,
    { container }
  ) => {
    const service = container.resolve<AgentModuleService>(AGENT_MODULE)

    await retrieveOwnedSession(service, input.session_id, input)
    const proposal = await service.createAgentProposals({
      session_id: input.session_id,
      action: input.action,
      args: input.args,
      preview: input.preview,
      summary: input.summary,
    })

    return new StepResponse(toProposal(proposal), proposal.id)
  },
  async (proposalId, { container }) => {
    if (!proposalId) {
      return
    }

    const service = container.resolve<AgentModuleService>(AGENT_MODULE)
    await service.deleteAgentProposals(proposalId)
  }
)

// Approved and dismissed are final. A failed approval can be tried again.
const resolvableStatuses = ["pending", "failed"]

export type AssistantProposalResolution = "approved" | "dismissed" | "failed"

// The member's changes to an approved suggestion, checked against what the
// action allows to be edited.
const applyProposalEdits = (
  action: string,
  args: Record<string, unknown>,
  edits?: Record<string, unknown>
) => {
  if (!edits) {
    return args
  }

  const parsed = parseProposalEdits(action, args, edits)

  if (!parsed) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "These changes can't be made to this suggestion"
    )
  }

  return { ...args, ...parsed }
}

const resolveAssistantProposalStep = createStep(
  "resolve-assistant-proposal",
  async (
    input: SessionOwner & {
      proposal_id: string
      status: AssistantProposalResolution
      error?: string
      edits?: Record<string, unknown>
    },
    { container }
  ) => {
    const service = container.resolve<AgentModuleService>(AGENT_MODULE)
    const [proposal] = await service.listAgentProposals(
      { id: input.proposal_id },
      {
        select: [
          "id",
          "session_id",
          "action",
          "args",
          "status",
          "error",
          "resolved_by_id",
          "resolved_at",
        ],
      }
    )
    // Only the member whose chat it is can resolve it. Anything else reads as
    // not found, like the conversation itself.
    const [session] = proposal
      ? await service.listAgentSessions({
          id: proposal.session_id,
          merchant_id: input.merchant_id,
          created_by_id: input.actor_id,
          agent_type: input.agent_type,
        })
      : []

    if (!proposal || !session) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        "Suggestion not found"
      )
    }

    if (!resolvableStatuses.includes(proposal.status)) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `This suggestion was already ${proposal.status}`
      )
    }

    const updated = await service.updateAgentProposals({
      id: proposal.id,
      args:
        input.status === "approved"
          ? applyProposalEdits(proposal.action, proposal.args, input.edits)
          : proposal.args,
      status: input.status,
      error: input.status === "failed" ? (input.error ?? null) : null,
      resolved_by_id: input.actor_id,
      resolved_at: new Date(),
    })

    return new StepResponse(toProposal(updated), {
      id: proposal.id,
      args: proposal.args,
      status: proposal.status,
      error: proposal.error,
      resolved_by_id: proposal.resolved_by_id,
      resolved_at: proposal.resolved_at,
    })
  },
  async (previous, { container }) => {
    if (!previous) {
      return
    }

    const service = container.resolve<AgentModuleService>(AGENT_MODULE)
    await service.updateAgentProposals(previous)
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
    const proposals = await listProposalsByMessage(
      service,
      session.id,
      messages
        .filter(({ role }) => role === "assistant")
        .map(({ id }) => id)
    )

    return new StepResponse({
      id: session.id,
      title: session.title,
      created_at: session.created_at,
      messages: messages.map((message) => ({
        ...message,
        proposals: proposals.get(message.id) ?? [],
      })),
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
    input: AssistantScopeInput & {
      session_id: string
      content: string
      proposal_ids?: string[]
    }
  ) {
    const scope = validateMerchantScopeStep(input)
    const message = saveAssistantReplyStep({
      merchant_id: scope.merchant_id,
      actor_id: input.actor_id,
      agent_type: input.agent_type,
      session_id: input.session_id,
      content: input.content,
    })
    const link = transform({ input, message }, (data) => ({
      session_id: data.input.session_id,
      message_id: data.message.id,
      proposal_ids: data.input.proposal_ids ?? [],
    }))
    linkAssistantProposalsStep(link)

    return new WorkflowResponse(message)
  }
)

// Saves a change the assistant suggested in the member's own conversation.
export const createAssistantProposalWorkflow = createWorkflow(
  "create-assistant-proposal",
  function (
    input: AssistantScopeInput & { session_id: string } & NewStoreAssistantProposal
  ) {
    const scope = validateMerchantScopeStep(input)
    const proposal = createAssistantProposalStep({
      merchant_id: scope.merchant_id,
      actor_id: input.actor_id,
      agent_type: input.agent_type,
      session_id: input.session_id,
      action: input.action,
      args: input.args,
      preview: input.preview,
      summary: input.summary,
    })

    return new WorkflowResponse(proposal)
  }
)

// Records what the member did with a suggestion. Approving runs the change
// through its own merchant route first; this only records the outcome.
export const resolveAssistantProposalWorkflow = createWorkflow(
  "resolve-assistant-proposal",
  function (
    input: AssistantScopeInput & {
      proposal_id: string
      status: AssistantProposalResolution
      error?: string
      edits?: Record<string, unknown>
    }
  ) {
    const scope = validateMerchantScopeStep(input)
    const proposal = resolveAssistantProposalStep({
      merchant_id: scope.merchant_id,
      actor_id: input.actor_id,
      agent_type: input.agent_type,
      proposal_id: input.proposal_id,
      status: input.status,
      error: input.error,
      edits: input.edits,
    })

    return new WorkflowResponse(proposal)
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
