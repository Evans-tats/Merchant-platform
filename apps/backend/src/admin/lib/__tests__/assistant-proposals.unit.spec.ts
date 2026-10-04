import {
  canApproveProposal,
  proposalDraft,
  proposalEditKind,
  proposalEdits,
  proposalLink,
  proposalRequest,
  proposalTitle,
} from "../assistant-proposals"
import type { MerchantAssistantProposal } from "../merchant-api"

const base = {
  id: "agprop_1",
  summary: "Why the assistant suggests it.",
  status: "pending",
  error: null,
} as const

const orderNote = {
  ...base,
  action: "add_order_note",
  args: {
    order_id: "order_1",
    note: "Customer asked for gift wrapping",
    // Anything else the model managed to put in args must never be sent.
    metadata: { refund: true },
  },
  preview: { order_number: 1042 },
} as MerchantAssistantProposal

const publish = {
  ...base,
  action: "publish_product",
  args: { product_id: "prod_1", status: "draft", variants: [] },
  preview: { title: "Kikoi", status: "draft" },
} as MerchantAssistantProposal

const description = {
  ...base,
  action: "update_product_description",
  args: { product_id: "prod_1", description: "Soft cotton kikoi." },
  preview: { title: "Kikoi", current_description: null },
} as MerchantAssistantProposal

const collection = {
  ...base,
  action: "add_collection_products",
  args: { collection_id: "pcol_1", product_ids: ["prod_1", "prod_2"] },
  preview: {
    collection_title: "Summer",
    products: [
      { id: "prod_1", title: "Kikoi", current_collection: null },
      { id: "prod_2", title: "Tote", current_collection: "Bags" },
    ],
  },
} as MerchantAssistantProposal

const customers = [
  { id: "cus_1", name: "Amina Otieno", email: "a***@example.com" },
  { id: "cus_2", name: "Brian Kamau", email: "b***@example.com" },
  { id: "cus_3", name: "Joy Wanjiru", email: "j***@example.com" },
]

const segmentChanges = {
  ...base,
  action: "update_segment_customers",
  args: { segment_id: "cusgroup_vip", add: ["cus_1", "cus_2"], remove: ["cus_3"] },
  preview: { segment_name: "VIP", customers },
} as MerchantAssistantProposal

const newSegment = {
  ...base,
  action: "create_segment",
  args: {
    name: "Lapsed regulars",
    description: "Old regulars.",
    customer_ids: ["cus_1", "cus_2"],
    discount: 10,
  },
  preview: { customers: customers.slice(0, 2) },
} as MerchantAssistantProposal

describe("assistant proposals", () => {
  it("approves an order note through the order notes route", () => {
    const draft = { ...proposalDraft(orderNote), text: "  Wrap it in blue  " }

    expect(proposalRequest(orderNote, draft)).toEqual({
      path: "/orders/order_1/notes",
      body: { note: "Wrap it in blue" },
    })
    expect(proposalEdits(orderNote, draft)).toEqual({ note: "Wrap it in blue" })
    expect(proposalTitle(orderNote)).toBe("Add a note to order #1042")
    expect(proposalLink(orderNote)).toEqual({
      to: "/merchant-orders/order_1",
      label: "Open order",
    })
  })

  it("publishes by changing only the status", () => {
    expect(proposalRequest(publish, proposalDraft(publish))).toEqual({
      path: "/products/prod_1",
      body: { update: { status: "published" } },
    })
    expect(proposalEditKind(publish)).toBeNull()
    expect(proposalEdits(publish, proposalDraft(publish))).toBeUndefined()
    expect(proposalTitle(publish)).toBe('Publish "Kikoi"')
  })

  it("replaces only the description, with the member's edits", () => {
    const draft = { ...proposalDraft(description), text: " Soft blue kikoi. " }

    expect(proposalRequest(description, draft)).toEqual({
      path: "/products/prod_1",
      body: { update: { description: "Soft blue kikoi." } },
    })
    expect(canApproveProposal(description, { ...draft, text: "  " })).toBe(false)
  })

  it("adds only the suggested products the member kept", () => {
    const draft = {
      ...proposalDraft(collection),
      product_ids: ["prod_2", "prod_other"],
    }

    expect(proposalRequest(collection, draft)).toEqual({
      path: "/collections/pcol_1/products",
      body: { add: ["prod_2"] },
    })
    expect(proposalTitle(collection)).toBe('Add 2 products to "Summer"')
    expect(
      canApproveProposal(collection, { ...draft, product_ids: [] })
    ).toBe(false)
  })

  it("changes only the segment members the member kept", () => {
    const draft = {
      ...proposalDraft(segmentChanges),
      customer_ids: ["cus_2", "cus_3", "cus_other"],
    }

    expect(proposalTitle(segmentChanges)).toBe('Update "VIP": add 2, remove 1')
    expect(proposalRequest(segmentChanges, draft)).toEqual({
      path: "/customer-segments/cusgroup_vip/customers",
      body: { add: ["cus_2"], remove: ["cus_3"] },
    })
    expect(proposalEdits(segmentChanges, draft)).toEqual({
      add: ["cus_2"],
      remove: ["cus_3"],
    })
    // Unticking every removal leaves remove out of the request.
    expect(
      proposalRequest(segmentChanges, { ...draft, customer_ids: ["cus_1"] })
    ).toEqual({
      path: "/customer-segments/cusgroup_vip/customers",
      body: { add: ["cus_1"] },
    })
    expect(
      canApproveProposal(segmentChanges, { ...draft, customer_ids: [] })
    ).toBe(false)
    expect(proposalLink(segmentChanges)).toEqual({
      to: "/merchant-customer-segments/cusgroup_vip",
      label: "Open segment",
    })
  })

  it("creates a segment with its customers in one request", () => {
    const draft = {
      ...proposalDraft(newSegment),
      name: "  Lapsed  ",
      text: " ",
      customer_ids: ["cus_2", "cus_other"],
    }

    expect(proposalEditKind(newSegment)).toBe("segment")
    expect(proposalTitle(newSegment)).toBe('Create the "Lapsed regulars" segment')
    expect(proposalRequest(newSegment, draft)).toEqual({
      path: "/customer-segments",
      body: { name: "Lapsed", description: null, customer_ids: ["cus_2"] },
    })
    expect(proposalEdits(newSegment, draft)).toEqual({
      name: "Lapsed",
      description: null,
      customer_ids: ["cus_2"],
    })
    expect(canApproveProposal(newSegment, { ...draft, name: " " })).toBe(false)
    expect(canApproveProposal(newSegment, { ...draft, customer_ids: [] })).toBe(
      true
    )
  })
})
