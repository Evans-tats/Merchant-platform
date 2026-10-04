import { defineRouteConfig } from "@medusajs/admin-sdk"
import {
  ArrowUpMini,
  ChatBubbleLeftRight,
  CheckMini,
  PlusMini,
  Sparkles,
  SquareTwoStack,
} from "@medusajs/icons"
import {
  Alert,
  Button,
  Checkbox,
  Container,
  IconButton,
  Input,
  Label,
  StatusBadge,
  Text,
  Textarea,
  clx,
  toast,
} from "@medusajs/ui"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"

import {
  MerchantPageHeader,
  MerchantPageSkeleton,
  MerchantRoute,
} from "../../../components/merchant/merchant-page"
import {
  canApproveProposal,
  proposalDoneLabel,
  proposalDraft,
  proposalEditKind,
  proposalEdits,
  proposalLink,
  proposalRequest,
  proposalResources,
  proposalTitle,
  type ProposalDraft,
} from "../../../lib/assistant-proposals"
import {
  parseAssistantText,
  plainAssistantText,
} from "../../../lib/assistant-text"
import {
  errorMessage,
  merchantApi,
  merchantQueryKeys,
  type MerchantAssistantEvent,
  type MerchantAssistantProposal,
  type MerchantAssistantProposalCustomer,
  type MerchantSession,
} from "../../../lib/merchant-api"

type ToolStatus = "running" | "done" | "failed"

type ChatMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  tools: Array<{ id: string; tool: string; status: ToolStatus }>
  proposals: MerchantAssistantProposal[]
  error?: string
}

const toolLabels: Record<string, string> = {
  get_sales_summary: "Checked sales",
  list_low_stock: "Checked stock levels",
  get_product_performance: "Checked product sales",
  find_products: "Searched products",
  get_product_details: "Read product details",
  list_orders: "Checked orders",
  get_order_details: "Read order details",
  list_customers: "Checked customers",
  list_customer_segments: "Checked customer segments",
  get_customer_details: "Read customer details",
  analyze_customers: "Checked customer spending",
  get_catalog_structure: "Checked categories and collections",
  list_delivery_methods: "Checked delivery methods",
  get_recent_activity: "Checked recent activity",
  propose_order_note: "Suggested an order note",
  propose_publish_product: "Suggested publishing a product",
  propose_product_description: "Suggested a description",
  propose_collection_products: "Suggested collection changes",
  propose_segment_customers: "Suggested segment changes",
  propose_create_segment: "Suggested a new segment",
}

const suggestions = [
  "What needs my attention today?",
  "How is my business doing this week?",
  "Who are my repeat customers?",
  "Draft an Instagram post for my best seller",
]

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : String(Date.now() + Math.random())

const relativeTime = (iso: string) => {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)

  if (minutes < 1) return "Just now"
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.floor(hours / 24)
  return days === 1 ? "Yesterday" : `${days} days ago`
}

// Applies one streamed event to the assistant message being written.
const applyEvent = (
  message: ChatMessage,
  event: MerchantAssistantEvent
): ChatMessage => {
  switch (event.type) {
    case "text":
      return { ...message, content: message.content + event.content }
    case "tool_call":
      return {
        ...message,
        tools: [
          ...message.tools,
          { id: event.id, tool: event.tool, status: "running" },
        ],
      }
    case "tool_result":
      return {
        ...message,
        tools: message.tools.map((tool) =>
          tool.id === event.id
            ? { ...tool, status: event.ok ? "done" : "failed" }
            : tool
        ),
      }
    case "proposal":
      return { ...message, proposals: [...message.proposals, event.proposal] }
    case "error":
      return { ...message, error: event.message }
    default:
      return message
  }
}

const ToolSteps = ({ tools }: { tools: ChatMessage["tools"] }) => {
  if (!tools.length) {
    return null
  }

  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="What the assistant checked">
      {tools.map((tool) => (
        <li
          key={tool.id}
          className="flex items-center gap-x-1 rounded-full border border-ui-border-base bg-ui-bg-base px-2 py-0.5"
        >
          {tool.status === "running" ? (
            <span
              className="size-3 animate-spin rounded-full border-2 border-ui-fg-muted border-t-transparent"
              aria-hidden
            />
          ) : (
            <CheckMini
              className={clx(
                tool.status === "failed"
                  ? "text-ui-fg-error"
                  : "text-ui-fg-interactive"
              )}
            />
          )}
          <Text size="xsmall" leading="compact" className="text-ui-fg-subtle">
            {toolLabels[tool.tool] ?? tool.tool}
            {tool.status === "failed" ? " (failed)" : ""}
          </Text>
        </li>
      ))}
    </ul>
  )
}

const AssistantText = ({ text }: { text: string }) => (
  <div className="flex flex-col break-words">
    {parseAssistantText(text).map((line, index) =>
      line.kind === "divider" ? (
        <hr key={index} className="my-2 border-ui-border-base" />
      ) : (
        <Text
          key={index}
          size="small"
          className="min-h-[1lh] whitespace-pre-wrap"
        >
          {line.segments.map((segment, segmentIndex) =>
            segment.bold ? (
              <strong key={segmentIndex} className="font-medium">
                {segment.text}
              </strong>
            ) : (
              segment.text
            )
          )}
        </Text>
      )
    )}
  </div>
)

// A change the assistant suggested. Approve calls the change's own merchant
// route with the member's login, then records the outcome in the chat.
const SectionLabel = ({ children }: { children: string }) => (
  <Text
    size="xsmall"
    leading="compact"
    weight="plus"
    className="text-ui-fg-subtle"
  >
    {children}
  </Text>
)

const TextBlock = ({ text, muted }: { text: string; muted?: boolean }) => (
  <div className="rounded-lg bg-ui-bg-subtle px-3 py-2">
    <Text
      size="small"
      className={clx(
        "whitespace-pre-wrap break-words",
        muted && "text-ui-fg-subtle"
      )}
    >
      {text}
    </Text>
  </div>
)

// Customers on a segment card, with checkboxes while the member edits.
const CustomerList = ({
  customers,
  draft,
  editing,
  inputId,
  onDraftChange,
}: {
  customers: MerchantAssistantProposalCustomer[]
  draft: ProposalDraft
  editing: boolean
  inputId: string
  onDraftChange: (draft: ProposalDraft) => void
}) => (
  <ul className="flex flex-col gap-y-2">
    {customers.map((customer) => {
      const checkboxId = `${inputId}-${customer.id}`

      return (
        <li key={customer.id} className="flex items-start gap-x-2">
          {editing && (
            <Checkbox
              id={checkboxId}
              checked={draft.customer_ids.includes(customer.id)}
              onCheckedChange={(checked) =>
                onDraftChange({
                  ...draft,
                  customer_ids:
                    checked === true
                      ? [...draft.customer_ids, customer.id]
                      : draft.customer_ids.filter((id) => id !== customer.id),
                })
              }
            />
          )}
          <div className="flex min-w-0 flex-col">
            {editing ? (
              <Label htmlFor={checkboxId} size="small" weight="plus">
                {customer.name}
              </Label>
            ) : (
              <Text size="small" leading="compact" weight="plus">
                {customer.name}
              </Text>
            )}
            {customer.email && customer.email !== customer.name && (
              <Text size="xsmall" className="text-ui-fg-subtle">
                {customer.email}
              </Text>
            )}
          </div>
        </li>
      )
    })}
  </ul>
)

// The suggestion itself: the text to save, or the products or customers it
// covers. While the card is open it shows the member's edits; afterwards,
// what was applied.
const ProposalBody = ({
  proposal,
  draft,
  editing,
  open,
  inputId,
  onDraftChange,
}: {
  proposal: MerchantAssistantProposal
  draft: ProposalDraft
  editing: boolean
  open: boolean
  inputId: string
  onDraftChange: (draft: ProposalDraft) => void
}) => {
  const shown = open ? draft : proposalDraft(proposal)
  const longText = proposal.action === "update_product_description"
  const textField = editing ? (
    <>
      <label htmlFor={inputId} className="sr-only">
        Edit the suggestion
      </label>
      <Textarea
        id={inputId}
        value={draft.text}
        rows={longText ? 6 : 3}
        maxLength={longText ? 5000 : 2000}
        onChange={(event) =>
          onDraftChange({ ...draft, text: event.target.value })
        }
      />
    </>
  ) : (
    <TextBlock text={shown.text} />
  )

  switch (proposal.action) {
    case "add_order_note":
      return textField
    case "publish_product":
      return (
        <Text size="small" className="text-ui-fg-subtle">
          {`It's ${proposal.preview.status} now. Publishing lets shoppers find and buy it.`}
        </Text>
      )
    case "update_product_description":
      return (
        <div className="flex flex-col gap-y-3">
          <div className="flex flex-col gap-y-1.5">
            <SectionLabel>
              {proposal.status === "approved"
                ? "New description"
                : "Suggested description"}
            </SectionLabel>
            {textField}
          </div>
          {proposal.status !== "dismissed" && (
            <div className="flex flex-col gap-y-1.5">
              <SectionLabel>{open ? "Current description" : "Before"}</SectionLabel>
              <TextBlock
                muted
                text={
                  proposal.preview.current_description ?? "No description yet."
                }
              />
            </div>
          )}
        </div>
      )
    case "add_collection_products": {
      const products = editing
        ? proposal.preview.products
        : proposal.preview.products.filter(({ id }) =>
            shown.product_ids.includes(id)
          )

      return (
        <ul className="flex flex-col gap-y-2">
          {products.map((product) => {
            const checkboxId = `${inputId}-${product.id}`
            const move =
              product.current_collection && proposal.status !== "dismissed"
                ? `${open ? "Moves" : "Moved"} out of "${product.current_collection}"`
                : null

            return (
              <li key={product.id} className="flex items-start gap-x-2">
                {editing && (
                  <Checkbox
                    id={checkboxId}
                    checked={draft.product_ids.includes(product.id)}
                    onCheckedChange={(checked) =>
                      onDraftChange({
                        ...draft,
                        product_ids:
                          checked === true
                            ? [...draft.product_ids, product.id]
                            : draft.product_ids.filter(
                                (id) => id !== product.id
                              ),
                      })
                    }
                  />
                )}
                <div className="flex min-w-0 flex-col">
                  {editing ? (
                    <Label htmlFor={checkboxId} size="small" weight="plus">
                      {product.title}
                    </Label>
                  ) : (
                    <Text size="small" leading="compact" weight="plus">
                      {product.title}
                    </Text>
                  )}
                  {move && (
                    <Text size="xsmall" className="text-ui-fg-subtle">
                      {move}
                    </Text>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )
    }
    case "update_segment_customers": {
      const { add, remove } = proposal.args
      const done = proposal.status === "approved"
      const byId = new Map(
        proposal.preview.customers.map((customer) => [customer.id, customer])
      )
      // Labels only when the card both adds and removes.
      const labelled = add.length > 0 && remove.length > 0
      const sections = [
        { label: done ? "Added" : "Add", ids: add },
        { label: done ? "Removed" : "Remove", ids: remove },
      ]

      return (
        <div className="flex flex-col gap-y-3">
          {sections.map(({ label, ids }) => {
            const customers = ids.flatMap((id) => {
              const customer = byId.get(id)

              return customer && (editing || shown.customer_ids.includes(id))
                ? [customer]
                : []
            })

            return customers.length ? (
              <div key={label} className="flex flex-col gap-y-1.5">
                {labelled && <SectionLabel>{label}</SectionLabel>}
                <CustomerList
                  customers={customers}
                  draft={draft}
                  editing={editing}
                  inputId={inputId}
                  onDraftChange={onDraftChange}
                />
              </div>
            ) : null
          })}
        </div>
      )
    }
    case "create_segment": {
      const customers = editing
        ? proposal.preview.customers
        : proposal.preview.customers.filter(({ id }) =>
            shown.customer_ids.includes(id)
          )

      return (
        <div className="flex flex-col gap-y-3">
          {editing ? (
            <>
              <div className="flex flex-col gap-y-1.5">
                <Label htmlFor={`${inputId}-name`} size="small" weight="plus">
                  Name
                </Label>
                <Input
                  id={`${inputId}-name`}
                  size="small"
                  value={draft.name}
                  maxLength={120}
                  onChange={(event) =>
                    onDraftChange({ ...draft, name: event.target.value })
                  }
                />
              </div>
              <div className="flex flex-col gap-y-1.5">
                <Label
                  htmlFor={`${inputId}-description`}
                  size="small"
                  weight="plus"
                >
                  Description
                </Label>
                <Textarea
                  id={`${inputId}-description`}
                  value={draft.text}
                  rows={2}
                  maxLength={500}
                  onChange={(event) =>
                    onDraftChange({ ...draft, text: event.target.value })
                  }
                />
              </div>
            </>
          ) : shown.text ? (
            <TextBlock text={shown.text} />
          ) : null}
          <div className="flex flex-col gap-y-1.5">
            <SectionLabel>
              {proposal.status === "approved" ? "Customers in it" : "Customers"}
            </SectionLabel>
            {customers.length ? (
              <CustomerList
                customers={customers}
                draft={draft}
                editing={editing}
                inputId={inputId}
                onDraftChange={onDraftChange}
              />
            ) : (
              <Text size="small" className="text-ui-fg-subtle">
                No customers yet. You can add them on the segment's page.
              </Text>
            )}
          </div>
        </div>
      )
    }
  }
}

const ProposalCard = ({
  merchantId,
  proposal,
  onChange,
}: {
  merchantId: string
  proposal: MerchantAssistantProposal
  onChange: (proposal: MerchantAssistantProposal) => void
}) => {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState(() => proposalDraft(proposal))
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState<"approve" | "dismiss" | null>(null)
  const open = proposal.status === "pending" || proposal.status === "failed"
  const editable = proposalEditKind(proposal) !== null
  // A publish card has nothing more to show once it's resolved.
  const showBody = open || proposal.action !== "publish_product"
  const link = proposalLink(proposal)
  const inputId = `proposal-${proposal.id}`

  const record = async (
    body: Parameters<typeof merchantApi.assistant.resolveProposal>[2]
  ) => {
    try {
      onChange(
        await merchantApi.assistant.resolveProposal(merchantId, proposal.id, body)
      )
      return true
    } catch (error) {
      toast.error(`The chat couldn't save this. ${errorMessage(error)}`)
      return false
    }
  }

  const approve = async () => {
    const request = proposalRequest(proposal, draft)
    setBusy("approve")

    try {
      await merchantApi.post(merchantId, request.path, request.body)
    } catch (error) {
      const message = errorMessage(error)
      if (!(await record({ status: "failed", error: message }))) {
        onChange({ ...proposal, status: "failed", error: message })
      }
      setBusy(null)
      return
    }

    setEditing(false)
    await Promise.all(
      proposalResources(proposal, draft).map((resource) =>
        queryClient.invalidateQueries({
          queryKey: merchantQueryKeys.resource(merchantId, resource),
        })
      )
    )
    // The change is made, so the card says so even if recording fails.
    if (
      !(await record({
        status: "approved",
        edits: proposalEdits(proposal, draft),
      }))
    ) {
      onChange({ ...proposal, status: "approved", error: null })
    }
    setBusy(null)
  }

  const dismiss = async () => {
    setBusy("dismiss")
    await record({ status: "dismissed" })
    setBusy(null)
  }

  return (
    <div className="flex max-w-full flex-col rounded-2xl border border-ui-border-base bg-ui-bg-base md:max-w-[85%]">
      <div className="flex flex-col gap-y-1 px-4 pt-3">
        <div className="flex items-center justify-between gap-x-2">
          <Text
            size="xsmall"
            leading="compact"
            weight="plus"
            className="text-ui-fg-muted"
          >
            Suggested change
          </Text>
          {proposal.status === "approved" && (
            <StatusBadge color="green">{proposalDoneLabel(proposal)}</StatusBadge>
          )}
          {proposal.status === "dismissed" && (
            <StatusBadge color="grey">Dismissed</StatusBadge>
          )}
          {proposal.status === "failed" && (
            <StatusBadge color="red">Didn't work</StatusBadge>
          )}
        </div>
        <Text size="small" leading="compact" weight="plus">
          {proposalTitle(proposal)}
        </Text>
        {proposal.summary && (
          <Text size="small" className="text-ui-fg-subtle">
            {proposal.summary}
          </Text>
        )}
      </div>

      {showBody && (
        <div className="px-4 py-3">
          <ProposalBody
            proposal={proposal}
            draft={draft}
            editing={editing}
            open={open}
            inputId={inputId}
            onDraftChange={setDraft}
          />
        </div>
      )}

      {proposal.status === "failed" && proposal.error && (
        <div className="px-4 pb-3">
          <Alert variant="error">{proposal.error}</Alert>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-ui-border-base px-4 py-2.5">
        {open ? (
          <>
            <Button
              size="small"
              variant="transparent"
              disabled={busy !== null}
              isLoading={busy === "dismiss"}
              onClick={dismiss}
            >
              Dismiss
            </Button>
            {editable && editing && (
              <Button
                size="small"
                variant="secondary"
                disabled={busy !== null}
                onClick={() => {
                  setDraft(proposalDraft(proposal))
                  setEditing(false)
                }}
              >
                Undo edits
              </Button>
            )}
            {editable && !editing && (
              <Button
                size="small"
                variant="secondary"
                disabled={busy !== null}
                onClick={() => setEditing(true)}
              >
                Edit
              </Button>
            )}
            <Button
              size="small"
              variant="primary"
              disabled={busy !== null || !canApproveProposal(proposal, draft)}
              isLoading={busy === "approve"}
              onClick={approve}
            >
              {proposal.status === "failed" ? "Try again" : "Approve"}
            </Button>
          </>
        ) : (
          <Button asChild size="small" variant="transparent">
            <Link to={link.to}>{link.label}</Link>
          </Button>
        )}
      </div>
    </div>
  )
}

const MessageRow = ({
  merchantId,
  message,
  streaming,
  onProposalChange,
}: {
  merchantId: string
  message: ChatMessage
  streaming: boolean
  onProposalChange: (proposal: MerchantAssistantProposal) => void
}) => {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-ui-button-inverted px-4 py-2.5 md:max-w-[70%]">
          <Text
            size="small"
            className="whitespace-pre-wrap text-ui-fg-on-inverted"
          >
            {message.content}
          </Text>
        </div>
      </div>
    )
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(plainAssistantText(message.content))
      toast.success("Copied")
    } catch {
      toast.error("Couldn't copy. Select the text and copy it instead.")
    }
  }

  return (
    <div className="flex items-start gap-x-3">
      <div className="merchant-brand-mark flex size-7 shrink-0 items-center justify-center rounded-full">
        <Sparkles className="size-4" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-y-2">
        <ToolSteps tools={message.tools} />
        {message.content && (
          <div className="max-w-full rounded-2xl rounded-tl-sm border border-ui-border-base bg-ui-bg-base px-4 py-3 md:max-w-[85%]">
            <AssistantText text={message.content} />
          </div>
        )}
        {streaming && !message.content && !message.error && (
          <Text size="small" className="text-ui-fg-muted">
            {message.tools.length ? "Writing an answer…" : "Thinking…"}
          </Text>
        )}
        {message.proposals.map((proposal) => (
          <ProposalCard
            key={proposal.id}
            merchantId={merchantId}
            proposal={proposal}
            onChange={onProposalChange}
          />
        ))}
        {message.error && (
          <Alert variant="error" className="max-w-full md:max-w-[85%]">
            {message.error}
          </Alert>
        )}
        {!streaming && message.content && (
          <div>
            <Button size="small" variant="transparent" onClick={copy}>
              <SquareTwoStack />
              Copy
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

const AssistantContent = ({ session }: { session: MerchantSession }) => {
  const merchantId = session.merchant.id
  const queryClient = useQueryClient()
  const sessionsKey = merchantQueryKeys.resource(merchantId, "assistant-sessions")
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const [loadingSession, setLoadingSession] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const statusQuery = useQuery({
    queryKey: merchantQueryKeys.resource(merchantId, "assistant-status"),
    queryFn: () => merchantApi.assistant.status(merchantId),
  })
  const sessionsQuery = useQuery({
    queryKey: sessionsKey,
    queryFn: () => merchantApi.assistant.sessions(merchantId),
  })

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [messages])

  const startNewChat = () => {
    setSessionId(null)
    setMessages([])
  }

  const openSession = async (id: string) => {
    if (sending || id === sessionId) {
      return
    }

    setLoadingSession(id)
    try {
      const saved = await merchantApi.assistant.session(merchantId, id)
      setSessionId(saved.id)
      setMessages(
        saved.messages.map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          tools: [],
          proposals: message.proposals ?? [],
        }))
      )
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setLoadingSession(null)
    }
  }

  const send = async (text: string) => {
    const message = text.trim()

    if (!message || sending) {
      return
    }

    const replyId = newId()
    const updateReply = (update: (reply: ChatMessage) => ChatMessage) =>
      setMessages((current) =>
        current.map((item) => (item.id === replyId ? update(item) : item))
      )

    setInput("")
    setSending(true)
    setMessages((current) => [
      ...current,
      { id: newId(), role: "user", content: message, tools: [], proposals: [] },
      { id: replyId, role: "assistant", content: "", tools: [], proposals: [] },
    ])

    try {
      await merchantApi.assistant.send(
        merchantId,
        { message, session_id: sessionId ?? undefined },
        (event) => {
          if (event.type === "session_id") {
            setSessionId(event.session_id)
            return
          }

          updateReply((reply) => applyEvent(reply, event))
        }
      )
    } catch (error) {
      updateReply((reply) => ({ ...reply, error: errorMessage(error) }))
    } finally {
      setSending(false)
      await queryClient.invalidateQueries({ queryKey: sessionsKey })
    }
  }

  const updateProposal = (proposal: MerchantAssistantProposal) =>
    setMessages((current) =>
      current.map((message) => ({
        ...message,
        proposals: message.proposals.map((item) =>
          item.id === proposal.id ? proposal : item
        ),
      }))
    )

  if (statusQuery.isPending) {
    return <MerchantPageSkeleton />
  }

  const enabled = statusQuery.data?.enabled ?? false
  const sessions = sessionsQuery.data ?? []

  return (
    <Container className="divide-y p-0">
      <MerchantPageHeader
        title="Assistant"
        subtitle="Ask about sales, stock, products and customers, or ask for a draft post or email. It can suggest changes for you to approve, but never changes, posts or sends anything itself."
        actions={
          <Button
            size="small"
            variant="secondary"
            onClick={startNewChat}
            disabled={sending}
          >
            <PlusMini />
            New chat
          </Button>
        }
      />

      {!enabled && (
        <div className="px-6 py-4">
          <Alert variant="warning">
            The assistant isn't set up yet. Add GEMINI_API_KEY to the backend
            .env file and restart the server.
          </Alert>
        </div>
      )}

      <div className="flex flex-col md:h-[calc(100vh-220px)] md:min-h-[520px] md:flex-row md:divide-x">
        <nav
          aria-label="Past chats"
          className="flex shrink-0 flex-col gap-y-1 overflow-y-auto p-3 md:w-64"
        >
          <Text
            size="xsmall"
            leading="compact"
            weight="plus"
            className="px-2 py-1 text-ui-fg-subtle"
          >
            Past chats
          </Text>
          {sessionsQuery.isPending && (
            <Text size="small" className="px-2 text-ui-fg-muted">
              Loading…
            </Text>
          )}
          {!sessionsQuery.isPending && !sessions.length && (
            <Text size="small" className="px-2 text-ui-fg-muted">
              Your chats will show here.
            </Text>
          )}
          <ul className="flex max-h-48 flex-col gap-y-0.5 overflow-y-auto md:max-h-none">
            {sessions.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => openSession(item.id)}
                  disabled={sending}
                  aria-current={item.id === sessionId ? "true" : undefined}
                  className={clx(
                    "flex w-full items-start gap-x-2 rounded-md px-2 py-2 text-left transition-colors disabled:cursor-not-allowed",
                    item.id === sessionId
                      ? "bg-ui-bg-base-pressed"
                      : "hover:bg-ui-bg-base-hover"
                  )}
                >
                  <ChatBubbleLeftRight className="mt-0.5 shrink-0 text-ui-fg-muted" />
                  <span className="min-w-0 flex-1">
                    <Text size="small" leading="compact" className="truncate">
                      {loadingSession === item.id
                        ? "Opening…"
                        : (item.title ?? "New chat")}
                    </Text>
                    <Text
                      size="xsmall"
                      leading="compact"
                      className="text-ui-fg-muted"
                    >
                      {relativeTime(item.created_at)}
                    </Text>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <section
          aria-label="Chat"
          className="flex min-h-[480px] min-w-0 flex-1 flex-col md:min-h-0"
        >
          <div
            className="flex flex-1 flex-col gap-y-5 overflow-y-auto bg-ui-bg-subtle px-4 py-5 md:px-6"
            aria-live="polite"
          >
            {!messages.length && (
              <div className="m-auto flex max-w-md flex-col items-center gap-y-4 py-8 text-center">
                <div className="merchant-brand-mark flex size-10 items-center justify-center rounded-full">
                  <Sparkles className="size-5" />
                </div>
                <div className="flex flex-col gap-y-1">
                  <Text weight="plus">What would you like to know?</Text>
                  <Text size="small" className="text-ui-fg-subtle">
                    Answers come from your store's own data. Drafts are for
                    you to review and post yourself.
                  </Text>
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  {suggestions.map((suggestion) => (
                    <Button
                      key={suggestion}
                      size="small"
                      variant="secondary"
                      disabled={!enabled || sending}
                      onClick={() => send(suggestion)}
                    >
                      {suggestion}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((message, index) => (
              <MessageRow
                key={message.id}
                merchantId={merchantId}
                message={message}
                streaming={sending && index === messages.length - 1}
                onProposalChange={updateProposal}
              />
            ))}
            <div ref={bottomRef} />
          </div>

          <form
            className="flex items-end gap-x-2 border-t border-ui-border-base bg-ui-bg-base px-4 py-3 md:px-6"
            onSubmit={(event) => {
              event.preventDefault()
              send(input)
            }}
          >
            <label htmlFor="merchant-assistant-input" className="sr-only">
              Message the assistant
            </label>
            <Textarea
              id="merchant-assistant-input"
              value={input}
              rows={2}
              maxLength={4000}
              disabled={!enabled}
              placeholder="Ask about sales, stock, or ask for a draft post…"
              className="min-h-0 flex-1 resize-none"
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault()
                  send(input)
                }
              }}
            />
            <IconButton
              type="submit"
              size="large"
              variant="primary"
              aria-label="Send"
              disabled={!enabled || sending || !input.trim()}
            >
              <ArrowUpMini />
            </IconButton>
          </form>
        </section>
      </div>
    </Container>
  )
}

const MerchantAssistantPage = () => (
  <MerchantRoute>
    {(session) => <AssistantContent session={session} />}
  </MerchantRoute>
)

export const config = defineRouteConfig({})
export const handle = { breadcrumb: () => "Assistant" }
export default MerchantAssistantPage
