import { MedusaError } from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"

import {
  MERCHANT_SEGMENT_DESCRIPTION_MAX_LENGTH,
  MERCHANT_SEGMENT_NAME_MAX_LENGTH,
} from "../merchant-customer-segments"

// Changes the assistant can suggest. It never applies them: each one is saved
// and shown in the chat as a card, and the member's Approve click calls the
// same merchant route the dashboard uses, under the member's own login.
//
// Refunds, cancellations and anything about prices are deliberately not here.

export const PRODUCT_DESCRIPTION_MAX_LENGTH = 5000

// Ids the member kept from a suggested list: they can leave some out, not add
// others.
const keptFrom = (suggestedIds: unknown, min = 0) => {
  const suggested = new Set(suggestedIds as string[])

  return z
    .array(z.string())
    .min(min)
    .refine((ids) => ids.every((id) => suggested.has(id)))
    .transform((ids) => Array.from(new Set(ids)))
}

// Per action, what the member can change on the card before approving,
// given the suggestion's args. The approved values are stored, so a reopened
// chat shows what was applied.
const editSchemas = {
  add_order_note: () =>
    z.object({ note: z.string().trim().min(1).max(2000) }),
  publish_product: () => z.strictObject({}),
  update_product_description: () =>
    z.object({
      description: z
        .string()
        .trim()
        .min(1)
        .max(PRODUCT_DESCRIPTION_MAX_LENGTH),
    }),
  add_collection_products: (args: Record<string, unknown>) =>
    z.object({ product_ids: keptFrom(args.product_ids, 1) }),
  update_segment_customers: (args: Record<string, unknown>) =>
    z
      .object({ add: keptFrom(args.add), remove: keptFrom(args.remove) })
      .refine(({ add, remove }) => add.length + remove.length > 0),
  create_segment: (args: Record<string, unknown>) =>
    z.object({
      name: z.string().trim().min(1).max(MERCHANT_SEGMENT_NAME_MAX_LENGTH),
      description: z
        .string()
        .trim()
        .max(MERCHANT_SEGMENT_DESCRIPTION_MAX_LENGTH)
        .nullable()
        .transform((description) => description || null),
      customer_ids: keptFrom(args.customer_ids),
    }),
}

export type StoreAssistantProposalAction = keyof typeof editSchemas

export const isStoreAssistantProposalAction = (
  action: string
): action is StoreAssistantProposalAction => action in editSchemas

// The member's changes, or null when the action doesn't allow them.
export const parseProposalEdits = (
  action: string,
  args: Record<string, unknown>,
  edits: unknown
): Record<string, unknown> | null => {
  if (!isStoreAssistantProposalAction(action)) {
    return null
  }

  const parsed = editSchemas[action](args).safeParse(edits)

  return parsed.success ? parsed.data : null
}

export type StoreAssistantProposalStatus =
  | "pending"
  | "approved"
  | "dismissed"
  | "failed"

// Enough cards for a real request; more is the model looping.
export const MAX_PROPOSALS_PER_REPLY = 3

export type NewStoreAssistantProposal = {
  action: StoreAssistantProposalAction
  // What Approve sends, built by the tool from checked ids and text.
  args: Record<string, unknown>
  // What the card shows, read from the store data rather than the model.
  preview: Record<string, unknown>
  // The model's one-line reason, shown under the card's title.
  summary: string
}

export type StoreAssistantProposal = NewStoreAssistantProposal & {
  id: string
  status: StoreAssistantProposalStatus
  error: string | null
}

type HistoryProposal = {
  action: string
  args: unknown
  preview: unknown
  status: string
  error?: string | null
}

type PreviewProduct = { id: string; title: string }

type PreviewCustomer = { id: string; name: string }

// Up to five names, then a count, so a long list stays one short line.
const customerNames = (ids: string[], customers: PreviewCustomer[]) => {
  if (ids.length > 5) {
    return `${ids.length} customers`
  }

  const names = new Map(customers.map(({ id, name }) => [id, name]))

  return ids.map((id) => `"${names.get(id) ?? "a customer"}"`).join(", ")
}

const describe = ({ action, args, preview }: HistoryProposal) => {
  const details = (preview ?? {}) as Record<string, unknown>
  const customers = (details.customers ?? []) as PreviewCustomer[]

  switch (action) {
    case "add_order_note":
      return `add a note to order #${details.order_number}`
    case "publish_product":
      return `publish "${details.title}"`
    case "update_product_description":
      return `update the description of "${details.title}"`
    case "add_collection_products": {
      // Only the products still in the suggestion: the member can untick some.
      const ids = new Set(
        ((args ?? {}) as { product_ids?: string[] }).product_ids ?? []
      )
      const titles = ((details.products ?? []) as PreviewProduct[])
        .filter(({ id }) => ids.has(id))
        .map(({ title }) => `"${title}"`)

      return `add ${titles.join(", ")} to the "${details.collection_title}" collection`
    }
    case "update_segment_customers": {
      // Only the customers still in the suggestion: the member can untick some.
      const { add = [], remove = [] } = (args ?? {}) as {
        add?: string[]
        remove?: string[]
      }
      const changes = [
        add.length ? `add ${customerNames(add, customers)}` : null,
        remove.length ? `remove ${customerNames(remove, customers)}` : null,
      ].filter(Boolean)

      return `update the "${details.segment_name}" segment: ${changes.join(", ")}`
    }
    case "create_segment": {
      // The member can rename the segment and untick customers.
      const { name, customer_ids = [] } = (args ?? {}) as {
        name?: string
        customer_ids?: string[]
      }

      return customer_ids.length
        ? `create the "${name}" segment with ${customerNames(customer_ids, customers)}`
        : `create the "${name}" segment`
    }
    default:
      return action
  }
}

const outcome = ({ status, error }: HistoryProposal) => {
  switch (status) {
    case "approved":
      return "approved by the owner and done"
    case "dismissed":
      return "dismissed by the owner"
    case "failed":
      return `failed${error ? `: ${error}` : ""}`
    default:
      return "waiting for the owner"
  }
}

// Earlier replies are sent back as text, so each suggestion becomes a line
// that tells the model what happened to it. The prompt explains these lines.
export const proposalHistoryLine = (proposal: HistoryProposal) =>
  `[Suggestion card: ${describe(proposal)} - ${outcome(proposal)}]`

// Saves and shows the suggestions of one reply, up to the limit. The ids go
// to the saved reply so the cards come back when the chat is reopened.
export const createProposalRecorder = (input: {
  save: (proposal: NewStoreAssistantProposal) => Promise<StoreAssistantProposal>
  emit: (event: { type: "proposal"; proposal: StoreAssistantProposal }) => void
  limit?: number
}) => {
  const ids: string[] = []
  const limit = input.limit ?? MAX_PROPOSALS_PER_REPLY
  // Counted before saving: the model can call several tools at once.
  let reserved = 0

  const propose = async (proposal: NewStoreAssistantProposal) => {
    if (reserved >= limit) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `You can suggest at most ${limit} changes in one reply. Tell the owner what else you would change instead.`
      )
    }

    reserved += 1
    let saved: StoreAssistantProposal

    try {
      saved = await input.save(proposal)
    } catch (error) {
      reserved -= 1
      throw error
    }

    ids.push(saved.id)
    input.emit({ type: "proposal", proposal: saved })

    return { id: saved.id }
  }

  return { propose, ids }
}
