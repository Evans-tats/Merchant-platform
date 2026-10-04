import type { MerchantAssistantProposal } from "./merchant-api"

// How the chat shows and applies each kind of suggestion. Approving calls the
// same merchant route the dashboard uses. The request body is built here
// from named fields only, never by passing the model's args through, so a
// suggestion can't change more than its card shows.

export type ProposalRequest = {
  path: string
  body: Record<string, unknown>
}

// What the member can change on the card before approving: the text of a
// note or description, a new segment's name, or which products or customers
// stay in the suggestion.
export type ProposalDraft = {
  text: string
  name: string
  product_ids: string[]
  customer_ids: string[]
}

export type ProposalEditKind =
  | "text"
  | "products"
  | "customers"
  | "segment"
  | null

const emptyDraft: ProposalDraft = {
  text: "",
  name: "",
  product_ids: [],
  customer_ids: [],
}

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? "" : "s"}`

// The suggested ids the member kept, even if the draft holds others.
const kept = (suggested: string[], draftIds: string[]) => {
  const ids = new Set(suggested)

  return Array.from(new Set(draftIds.filter((id) => ids.has(id))))
}

export const proposalTitle = (proposal: MerchantAssistantProposal) => {
  switch (proposal.action) {
    case "add_order_note":
      return `Add a note to order #${proposal.preview.order_number}`
    case "publish_product":
      return `Publish "${proposal.preview.title}"`
    case "update_product_description":
      return `New description for "${proposal.preview.title}"`
    case "add_collection_products":
      return `Add ${plural(proposal.args.product_ids.length, "product")} to "${proposal.preview.collection_title}"`
    case "update_segment_customers": {
      const { add, remove } = proposal.args
      const segment = `"${proposal.preview.segment_name}"`

      if (!remove.length) {
        return `Add ${plural(add.length, "customer")} to ${segment}`
      }

      return add.length
        ? `Update ${segment}: add ${add.length}, remove ${remove.length}`
        : `Remove ${plural(remove.length, "customer")} from ${segment}`
    }
    case "create_segment":
      return `Create the "${proposal.args.name}" segment`
  }
}

export const proposalDoneLabel = (proposal: MerchantAssistantProposal) => {
  switch (proposal.action) {
    case "add_order_note":
      return "Note added"
    case "publish_product":
      return "Published"
    case "update_product_description":
      return "Description updated"
    case "add_collection_products":
      return "Products added"
    case "update_segment_customers":
      return "Segment updated"
    case "create_segment":
      return "Segment created"
  }
}

export const proposalEditKind = (
  proposal: MerchantAssistantProposal
): ProposalEditKind => {
  switch (proposal.action) {
    case "add_order_note":
    case "update_product_description":
      return "text"
    case "add_collection_products":
      return "products"
    case "update_segment_customers":
      return "customers"
    case "create_segment":
      return "segment"
    case "publish_product":
      return null
  }
}

// The card's starting point: what the suggestion says, or what was applied.
export const proposalDraft = (
  proposal: MerchantAssistantProposal
): ProposalDraft => {
  switch (proposal.action) {
    case "add_order_note":
      return { ...emptyDraft, text: proposal.args.note }
    case "update_product_description":
      return { ...emptyDraft, text: proposal.args.description }
    case "add_collection_products":
      return { ...emptyDraft, product_ids: proposal.args.product_ids }
    case "update_segment_customers":
      return {
        ...emptyDraft,
        customer_ids: [...proposal.args.add, ...proposal.args.remove],
      }
    case "create_segment":
      return {
        ...emptyDraft,
        name: proposal.args.name,
        text: proposal.args.description ?? "",
        customer_ids: proposal.args.customer_ids,
      }
    case "publish_product":
      return emptyDraft
  }
}

export const canApproveProposal = (
  proposal: MerchantAssistantProposal,
  draft: ProposalDraft
) => {
  switch (proposalEditKind(proposal)) {
    case "text":
      return Boolean(draft.text.trim())
    case "products":
      return draft.product_ids.length > 0
    case "customers":
      return draft.customer_ids.length > 0
    case "segment":
      return Boolean(draft.name.trim())
    default:
      return true
  }
}

// Where to see the change in the dashboard.
export const proposalLink = (proposal: MerchantAssistantProposal) => {
  switch (proposal.action) {
    case "add_order_note":
      return {
        to: `/merchant-orders/${proposal.args.order_id}`,
        label: "Open order",
      }
    case "publish_product":
    case "update_product_description":
      return {
        to: `/merchant-products/${proposal.args.product_id}`,
        label: "Open product",
      }
    case "add_collection_products":
      return {
        to: `/merchant-collections/${proposal.args.collection_id}`,
        label: "Open collection",
      }
    case "update_segment_customers":
      return {
        to: `/merchant-customer-segments/${proposal.args.segment_id}`,
        label: "Open segment",
      }
    // The new segment's id isn't kept with the suggestion.
    case "create_segment":
      return { to: "/merchant-customer-segments", label: "Open segments" }
  }
}

// Query keys of the pages the change shows up on.
export const proposalResources = (
  proposal: MerchantAssistantProposal,
  draft: ProposalDraft
) => {
  switch (proposal.action) {
    case "add_order_note":
      return [`orders/${proposal.args.order_id}`, "orders"]
    case "publish_product":
      return [
        `products/${proposal.args.product_id}`,
        "products",
        "dashboard",
        "home",
      ]
    case "update_product_description":
      return [`products/${proposal.args.product_id}`, "products"]
    case "add_collection_products":
      return [
        `collections/${proposal.args.collection_id}`,
        "collections",
        "products",
        "product-references",
        ...draft.product_ids.map((id) => `products/${id}`),
      ]
    case "update_segment_customers":
      return [
        `customer-segments/${proposal.args.segment_id}`,
        "customer-segments",
        "customers",
        ...draft.customer_ids.map((id) => `customers/${id}`),
      ]
    case "create_segment":
      return [
        "customer-segments",
        "customers",
        ...draft.customer_ids.map((id) => `customers/${id}`),
      ]
  }
}

// What the member changed, stored with the approval so a reopened chat
// shows what was applied.
export const proposalEdits = (
  proposal: MerchantAssistantProposal,
  draft: ProposalDraft
): Record<string, unknown> | undefined => {
  switch (proposal.action) {
    case "add_order_note":
      return { note: draft.text.trim() }
    case "update_product_description":
      return { description: draft.text.trim() }
    case "add_collection_products":
      return { product_ids: draft.product_ids }
    case "update_segment_customers":
      return {
        add: kept(proposal.args.add, draft.customer_ids),
        remove: kept(proposal.args.remove, draft.customer_ids),
      }
    case "create_segment":
      return {
        name: draft.name.trim(),
        description: draft.text.trim() || null,
        customer_ids: kept(proposal.args.customer_ids, draft.customer_ids),
      }
    case "publish_product":
      return undefined
  }
}

export const proposalRequest = (
  proposal: MerchantAssistantProposal,
  draft: ProposalDraft
): ProposalRequest => {
  switch (proposal.action) {
    case "add_order_note":
      return {
        path: `/orders/${encodeURIComponent(proposal.args.order_id)}/notes`,
        body: { note: draft.text.trim() },
      }
    case "publish_product":
      return {
        path: `/products/${encodeURIComponent(proposal.args.product_id)}`,
        body: { update: { status: "published" } },
      }
    case "update_product_description":
      return {
        path: `/products/${encodeURIComponent(proposal.args.product_id)}`,
        body: { update: { description: draft.text.trim() } },
      }
    case "add_collection_products":
      return {
        path: `/collections/${encodeURIComponent(proposal.args.collection_id)}/products`,
        body: { add: kept(proposal.args.product_ids, draft.product_ids) },
      }
    case "update_segment_customers": {
      const add = kept(proposal.args.add, draft.customer_ids)
      const remove = kept(proposal.args.remove, draft.customer_ids)

      return {
        path: `/customer-segments/${encodeURIComponent(proposal.args.segment_id)}/customers`,
        body: {
          ...(add.length ? { add } : {}),
          ...(remove.length ? { remove } : {}),
        },
      }
    }
    // One request: the route adds the customers with the segment, so a
    // refused customer leaves no empty segment behind.
    case "create_segment":
      return {
        path: "/customer-segments",
        body: {
          name: draft.name.trim(),
          description: draft.text.trim() || null,
          customer_ids: kept(proposal.args.customer_ids, draft.customer_ids),
        },
      }
  }
}
