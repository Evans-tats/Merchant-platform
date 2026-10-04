import type { MerchantOrder } from "../../../../lib/merchant-api"
import {
  amountToConfirm,
  canCancelMerchantOrder,
  formatOrderWorkflowStatus,
  merchantOrderWorkflowStatus,
  merchantPaymentState,
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

  it("waits for the merchant to confirm a manual payment", () => {
    const payment = { id: "pay_1", amount: 6600 }

    expect(merchantPaymentState(payment)).toBe("to_confirm")
    expect(
      merchantPaymentState({ ...payment, captured_at: "2026-10-04" })
    ).toBe("paid")
    expect(
      merchantPaymentState({
        ...payment,
        captured_at: "2026-10-04",
        canceled_at: "2026-10-05",
      })
    ).toBe("canceled")
  })

  it("confirms only what is left after an earlier partial capture", () => {
    expect(amountToConfirm({ id: "pay_1", amount: 44.1 })).toBe(44.1)
    expect(
      amountToConfirm({
        id: "pay_1",
        amount: 44.1,
        captures: [{ id: "capt_1", amount: 20.05 }, null],
      })
    ).toBe(24.05)
  })
})
