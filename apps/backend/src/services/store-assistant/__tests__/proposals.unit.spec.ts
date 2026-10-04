import {
  createProposalRecorder,
  parseProposalEdits,
  proposalHistoryLine,
  type NewStoreAssistantProposal,
  type StoreAssistantProposal,
} from "../proposals"

const suggestion: NewStoreAssistantProposal = {
  action: "add_order_note",
  args: { order_id: "order_1", note: "Customer asked for gift wrapping" },
  preview: { order_number: 1042 },
  summary: "The customer mentioned it's a gift.",
}

describe("proposalHistoryLine", () => {
  it("tells the model what happened to each suggestion", () => {
    const line = (status: string, error?: string) =>
      proposalHistoryLine({ ...suggestion, status, error })

    expect(line("pending")).toBe(
      "[Suggestion card: add a note to order #1042 - waiting for the owner]"
    )
    expect(line("approved")).toBe(
      "[Suggestion card: add a note to order #1042 - approved by the owner and done]"
    )
    expect(line("dismissed")).toBe(
      "[Suggestion card: add a note to order #1042 - dismissed by the owner]"
    )
    expect(line("failed", "Order not found")).toBe(
      "[Suggestion card: add a note to order #1042 - failed: Order not found]"
    )
  })

  it("names the product or collection changes", () => {
    expect(
      proposalHistoryLine({
        action: "publish_product",
        args: { product_id: "prod_1" },
        preview: { title: "Kikoi", status: "draft" },
        status: "dismissed",
      })
    ).toBe('[Suggestion card: publish "Kikoi" - dismissed by the owner]')
    expect(
      proposalHistoryLine({
        action: "update_product_description",
        args: { product_id: "prod_1", description: "Soft cotton." },
        preview: { title: "Kikoi", current_description: null },
        status: "pending",
      })
    ).toBe(
      '[Suggestion card: update the description of "Kikoi" - waiting for the owner]'
    )
    // Only the products the member kept are named.
    expect(
      proposalHistoryLine({
        action: "add_collection_products",
        args: { collection_id: "pcol_1", product_ids: ["prod_2"] },
        preview: {
          collection_title: "Summer",
          products: [
            { id: "prod_1", title: "Kikoi", current_collection: null },
            { id: "prod_2", title: "Tote", current_collection: "Bags" },
          ],
        },
        status: "approved",
      })
    ).toBe(
      '[Suggestion card: add "Tote" to the "Summer" collection - approved by the owner and done]'
    )
  })

  it("names the segment changes the member kept", () => {
    const customers = [
      { id: "cus_1", name: "Amina Otieno", email: "a***@example.com" },
      { id: "cus_2", name: "Brian Kamau", email: "b***@example.com" },
      { id: "cus_3", name: "Joy Wanjiru", email: "j***@example.com" },
    ]

    expect(
      proposalHistoryLine({
        action: "update_segment_customers",
        args: { segment_id: "cusgroup_vip", add: ["cus_1"], remove: ["cus_3"] },
        preview: { segment_name: "VIP", customers },
        status: "approved",
      })
    ).toBe(
      '[Suggestion card: update the "VIP" segment: add "Amina Otieno", remove "Joy Wanjiru" - approved by the owner and done]'
    )
    // The approved name, and a count instead of a long list of names.
    expect(
      proposalHistoryLine({
        action: "create_segment",
        args: {
          name: "Lapsed regulars",
          description: null,
          customer_ids: ["cus_1", "cus_2", "cus_3", "cus_4", "cus_5", "cus_6"],
        },
        preview: { customers },
        status: "pending",
      })
    ).toBe(
      '[Suggestion card: create the "Lapsed regulars" segment with 6 customers - waiting for the owner]'
    )
  })
})

describe("parseProposalEdits", () => {
  it("lets the member change the note but nothing else", () => {
    expect(
      parseProposalEdits("add_order_note", suggestion.args, {
        note: "  Wrap it in blue paper  ",
        order_id: "order_other",
      })
    ).toEqual({ note: "Wrap it in blue paper" })
    expect(
      parseProposalEdits("add_order_note", suggestion.args, { note: "   " })
    ).toBeNull()
  })

  it("lets the member leave products out but not add others", () => {
    const args = { collection_id: "pcol_1", product_ids: ["prod_1", "prod_2"] }

    expect(
      parseProposalEdits("add_collection_products", args, {
        product_ids: ["prod_2", "prod_2"],
      })
    ).toEqual({ product_ids: ["prod_2"] })
    expect(
      parseProposalEdits("add_collection_products", args, {
        product_ids: ["prod_1", "prod_other"],
      })
    ).toBeNull()
    expect(
      parseProposalEdits("add_collection_products", args, { product_ids: [] })
    ).toBeNull()
  })

  it("lets the member leave customers out of segment changes", () => {
    const args = { segment_id: "cusgroup_vip", add: ["cus_1", "cus_2"], remove: ["cus_3"] }

    expect(
      parseProposalEdits("update_segment_customers", args, {
        add: ["cus_2"],
        remove: [],
        segment_id: "cusgroup_other",
      })
    ).toEqual({ add: ["cus_2"], remove: [] })
    expect(
      parseProposalEdits("update_segment_customers", args, {
        add: ["cus_other"],
        remove: [],
      })
    ).toBeNull()
    expect(
      parseProposalEdits("update_segment_customers", args, { add: [], remove: [] })
    ).toBeNull()
  })

  it("lets the member rename a new segment and leave customers out", () => {
    const args = { name: "Lapsed", description: "Old regulars.", customer_ids: ["cus_1"] }

    expect(
      parseProposalEdits("create_segment", args, {
        name: "  Lapsed regulars ",
        description: "  ",
        customer_ids: [],
      })
    ).toEqual({ name: "Lapsed regulars", description: null, customer_ids: [] })
    expect(
      parseProposalEdits("create_segment", args, {
        name: " ",
        description: null,
        customer_ids: [],
      })
    ).toBeNull()
    expect(
      parseProposalEdits("create_segment", args, {
        name: "Lapsed",
        description: null,
        customer_ids: ["cus_other"],
      })
    ).toBeNull()
  })

  it("allows no edits to a publish and rejects unknown actions", () => {
    expect(parseProposalEdits("publish_product", {}, {})).toEqual({})
    expect(
      parseProposalEdits("publish_product", {}, { status: "draft" })
    ).toBeNull()
    expect(parseProposalEdits("refund_order", {}, {})).toBeNull()
  })
})

describe("createProposalRecorder", () => {
  const saved = (id: string): StoreAssistantProposal => ({
    ...suggestion,
    id,
    status: "pending",
    error: null,
  })

  it("saves, shows and collects each suggestion", async () => {
    const emit = jest.fn()
    const save = jest.fn().mockResolvedValueOnce(saved("agprop_1"))
    const recorder = createProposalRecorder({ save, emit })

    await expect(recorder.propose(suggestion)).resolves.toEqual({
      id: "agprop_1",
    })
    expect(save).toHaveBeenCalledWith(suggestion)
    expect(emit).toHaveBeenCalledWith({
      type: "proposal",
      proposal: saved("agprop_1"),
    })
    expect(recorder.ids).toEqual(["agprop_1"])
  })

  it("caps suggestions per reply, even when the model asks at once", async () => {
    let next = 0
    const save = jest.fn(async () => saved(`agprop_${(next += 1)}`))
    const recorder = createProposalRecorder({ save, emit: jest.fn(), limit: 2 })

    const results = await Promise.allSettled([
      recorder.propose(suggestion),
      recorder.propose(suggestion),
      recorder.propose(suggestion),
    ])

    expect(results.map(({ status }) => status)).toEqual([
      "fulfilled",
      "fulfilled",
      "rejected",
    ])
    expect(save).toHaveBeenCalledTimes(2)
    expect(recorder.ids).toEqual(["agprop_1", "agprop_2"])
  })

  it("frees the slot when saving fails", async () => {
    const save = jest
      .fn()
      .mockRejectedValueOnce(new Error("Conversation not found"))
      .mockResolvedValueOnce(saved("agprop_1"))
    const emit = jest.fn()
    const recorder = createProposalRecorder({ save, emit, limit: 1 })

    await expect(recorder.propose(suggestion)).rejects.toThrow(
      "Conversation not found"
    )
    await expect(recorder.propose(suggestion)).resolves.toEqual({
      id: "agprop_1",
    })
    expect(emit).toHaveBeenCalledTimes(1)
  })
})
