import type {
  MerchantOrder,
  MerchantOrderItem,
} from "../../../../../lib/merchant-api"
import {
  canFulfillMerchantOrder,
  fulfillableQuantity,
  orderCustomerPresentation,
  orderItemTotal,
} from "../order-detail-utils"

const item = (
  overrides: Partial<MerchantOrderItem> = {}
): MerchantOrderItem => ({
  id: "item_1",
  title: "Test item",
  quantity: 2,
  unit_price: 100,
  ...overrides,
})

describe("merchant order detail presentation", () => {
  it("prefers the server item total and never returns NaN", () => {
    expect(orderItemTotal(item({ total: 175 }))).toBe(175)
    expect(orderItemTotal(item({ total: Number.NaN }))).toBe(200)
    expect(
      orderItemTotal(
        item({
          total: Number.NaN,
          unit_price: Number.NaN,
          quantity: Number.NaN,
        })
      )
    ).toBeUndefined()
  })

  it("only falls back to unit price times quantity when both are finite", () => {
    expect(orderItemTotal(item({ total: undefined }))).toBe(200)
    expect(
      orderItemTotal(item({ total: undefined, unit_price: undefined }))
    ).toBeUndefined()
  })

  it.each(["owner", "admin"] as const)(
    "makes fulfillment available to the %s role for unfulfilled items",
    (role) => {
      expect(canFulfillMerchantOrder(role, [item()])).toBe(true)
    }
  )

  it("does not make fulfillment available to staff", () => {
    expect(canFulfillMerchantOrder("staff", [item()])).toBe(false)
  })

  it("subtracts fulfilled quantity from ordered quantity", () => {
    expect(
      fulfillableQuantity(
        item({ quantity: 5, detail: { fulfilled_quantity: 2 } })
      )
    ).toBe(3)
  })

  it("uses Medusa raw quantities when numeric projections are absent", () => {
    const rawItem = item({
      quantity: undefined as unknown as number,
      raw_quantity: { value: "3" },
      detail: {
        fulfilled_quantity: undefined,
        raw_fulfilled_quantity: { value: "1" },
      },
    })

    expect(fulfillableQuantity(rawItem)).toBe(2)
    expect(canFulfillMerchantOrder("owner", [rawItem])).toBe(true)
  })

  it("treats malformed quantities as unavailable instead of producing NaN", () => {
    const malformed = item({
      quantity: Number.NaN,
      raw_quantity: { value: "not-a-number" },
      detail: { fulfilled_quantity: Number.NaN },
    })

    expect(fulfillableQuantity(malformed)).toBe(0)
    expect(canFulfillMerchantOrder("admin", [malformed])).toBe(false)
  })

  it("presents returned registered-customer data", () => {
    const presentation = orderCustomerPresentation({
      id: "order_1",
      display_id: 1,
      status: "pending",
      email: "order@example.test",
      customer: {
        id: "cus_1",
        email: "customer@example.test",
        first_name: "Ada",
        last_name: "Lovelace",
        phone: "+254700000000",
        company_name: "Analytical Engines",
        has_account: true,
      },
    })

    expect(presentation).toEqual({
      name: "Ada Lovelace",
      email: "customer@example.test",
      phone: "+254700000000",
      companyName: "Analytical Engines",
      accountLabel: "Registered customer",
    })
  })

  it("uses a safe guest-customer fallback", () => {
    const presentation = orderCustomerPresentation({
      id: "order_2",
      display_id: 2,
      status: "pending",
      email: "guest@example.test",
      customer_id: null,
      customer: null,
    } as MerchantOrder)

    expect(presentation.name).toBe("Guest customer")
    expect(presentation.email).toBe("guest@example.test")
    expect(presentation.phone).toBeNull()
    expect(presentation.accountLabel).toBe("Guest customer")
  })
})
