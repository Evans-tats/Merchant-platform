import type { MerchantOrder } from "../../../../lib/merchant-api"
import {
  canCancelMerchantOrder,
  formatOrderWorkflowStatus,
  merchantOrderWorkflowStatus,
} from "../order-list-utils"

const order = (overrides: Partial<MerchantOrder> = {}): MerchantOrder => ({
  id: "order_1",
  display_id: 1,
  status: "pending",
  fulfillment_status: "not_fulfilled",
  ...overrides,
})

describe("order list utilities", () => {
  it("shows delivered instead of the general pending order status", () => {
    expect(
      merchantOrderWorkflowStatus(
        order({ fulfillment_status: "delivered" })
      )
    ).toBe("delivered")
  })

  it("keeps cancellation as the terminal status", () => {
    expect(
      merchantOrderWorkflowStatus(
        order({ status: "canceled", fulfillment_status: "delivered" })
      )
    ).toBe("canceled")
  })

  it("does not allow canceling an order with an active fulfillment", () => {
    expect(
      canCancelMerchantOrder(
        order({
          fulfillment_status: "delivered",
          fulfillments: [{ id: "ful_1", delivered_at: "2026-09-09" }],
        })
      )
    ).toBe(false)
  })

  it("allows canceling when all fulfillments were canceled", () => {
    expect(
      canCancelMerchantOrder(
        order({
          fulfillment_status: "canceled",
          fulfillments: [{ id: "ful_1", canceled_at: "2026-09-09" }],
        })
      )
    ).toBe(true)
  })

  it("formats compound statuses for display", () => {
    expect(formatOrderWorkflowStatus("partially_fulfilled")).toBe(
      "partially fulfilled"
    )
  })
})
