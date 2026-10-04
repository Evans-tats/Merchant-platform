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
  Container,
  IconButton,
  Text,
  Textarea,
  clx,
  toast,
} from "@medusajs/ui"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"

import {
  MerchantPageHeader,
  MerchantPageSkeleton,
  MerchantRoute,
} from "../../../components/merchant/merchant-page"
import {
  parseAssistantText,
  plainAssistantText,
} from "../../../lib/assistant-text"
import {
  errorMessage,
  merchantApi,
  merchantQueryKeys,
  type MerchantAssistantEvent,
  type MerchantSession,
} from "../../../lib/merchant-api"

type ToolStatus = "running" | "done" | "failed"

type ChatMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  tools: Array<{ id: string; tool: string; status: ToolStatus }>
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
  get_catalog_structure: "Checked categories and collections",
  list_delivery_methods: "Checked delivery methods",
  get_recent_activity: "Checked recent activity",
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

const MessageRow = ({
  message,
  streaming,
}: {
  message: ChatMessage
  streaming: boolean
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
      { id: newId(), role: "user", content: message, tools: [] },
      { id: replyId, role: "assistant", content: "", tools: [] },
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

  if (statusQuery.isPending) {
    return <MerchantPageSkeleton />
  }

  const enabled = statusQuery.data?.enabled ?? false
  const sessions = sessionsQuery.data ?? []

  return (
    <Container className="divide-y p-0">
      <MerchantPageHeader
        title="Assistant"
        subtitle="Ask about sales, stock and products, or ask for a draft post or email. It reads your store data but can't change, post or send anything."
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
                message={message}
                streaming={sending && index === messages.length - 1}
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
