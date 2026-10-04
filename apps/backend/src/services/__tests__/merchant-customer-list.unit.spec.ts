import { buildMerchantCustomerList } from "../merchant-customer-list"

describe("merchant customer list", () => {
  it("includes an order customer even when no merchant profile exists", () => {
    const customers = buildMerchantCustomerList({
      orders: [
        {
          id: "order_1",
          customer_id: "cus_guest",
          email: "guest@example.test",
          created_at: "2026-09-08T10:00:00.000Z",
          customer: {
            id: "cus_guest",
            email: "guest@example.test",
            first_name: "Grace",
            last_name: "Hopper",
            has_account: false,
          },
        },
      ],
    })

    expect(customers).toEqual([
      expect.objectContaining({
        id: "cus_guest",
        customer_id: "cus_guest",
        email: "guest@example.test",
        first_name: "Grace",
        has_account: false,
        order_count: 1,
      }),
    ])
  })

  it("merges merchant profile data with all orders for a customer", () => {
    const customers = buildMerchantCustomerList({
      customerProfiles: [
        {
          id: "mercprof_1",
          customer_id: "cus_1",
          status: "suspended",
          profile: { first_name: "Merchant-specific" },
          customer: {
            id: "cus_1",
            email: "buyer@example.test",
            first_name: "Core name",
            has_account: true,
          },
        },
      ],
      orders: [
        {
          id: "order_1",
          customer_id: "cus_1",
          created_at: "2026-09-01T10:00:00.000Z",
          customer: { id: "cus_1", email: "buyer@example.test" },
        },
        {
          id: "order_2",
          customer_id: "cus_1",
          created_at: "2026-09-08T10:00:00.000Z",
          customer: { id: "cus_1", email: "buyer@example.test" },
        },
      ],
    })

    expect(customers).toHaveLength(1)
    expect(customers[0]).toEqual(
      expect.objectContaining({
        merchant_profile_id: "mercprof_1",
        status: "suspended",
        first_name: "Merchant-specific",
        has_account: true,
        order_count: 2,
        first_order_at: "2026-09-01T10:00:00.000Z",
        last_order_at: "2026-09-08T10:00:00.000Z",
      })
    )
  })

  it("keeps guest and registered customer records with the same email separate", () => {
    const customers = buildMerchantCustomerList({
      orders: [
        {
          id: "order_guest",
          customer_id: "cus_guest",
          email: "same@example.test",
          customer: { id: "cus_guest", has_account: false },
        },
        {
          id: "order_registered",
          customer_id: "cus_registered",
          email: "same@example.test",
          customer: { id: "cus_registered", has_account: true },
        },
      ],
    })

    expect(customers.map(({ customer_id }) => customer_id).sort()).toEqual([
      "cus_guest",
      "cus_registered",
    ])
  })

  it("counts spend on placed orders only, like the home page", () => {
    const order = (id: string, status: string, total: number, currency = "kes") => ({
      id,
      customer_id: "cus_1",
      status,
      total,
      currency_code: currency,
      created_at: "2026-09-01T10:00:00.000Z",
    })
    const [customer] = buildMerchantCustomerList({
      orders: [
        order("order_1", "completed", 2500),
        order("order_2", "pending", 1500, "KES"),
        order("order_3", "canceled", 9000),
        order("order_4", "draft", 400),
      ],
    })

    expect(customer).toEqual(
      expect.objectContaining({
        order_count: 4,
        placed_order_count: 2,
        total_spent: 4000,
        currency_code: "kes",
      })
    )
  })

  it("leaves the currency out when placed orders mix currencies", () => {
    const [customer] = buildMerchantCustomerList({
      orders: [
        { id: "order_1", customer_id: "cus_1", status: "pending", total: 10, currency_code: "usd" },
        { id: "order_2", customer_id: "cus_1", status: "pending", total: 1500, currency_code: "kes" },
        { id: "order_3", customer_id: "cus_1", status: "pending", total: 20, currency_code: "usd" },
      ],
    })

    expect(customer).toEqual(
      expect.objectContaining({ placed_order_count: 3, currency_code: null })
    )
  })

  it("starts customers without placed orders at nothing spent", () => {
    const [customer] = buildMerchantCustomerList({
      customerProfiles: [
        { id: "mercprof_1", customer_id: "cus_1", status: "active", profile: {} },
      ],
    })

    expect(customer).toEqual(
      expect.objectContaining({
        order_count: 0,
        placed_order_count: 0,
        total_spent: 0,
        currency_code: null,
      })
    )
  })

  it("deduplicates legacy orders without a customer ID by normalized email", () => {
    const customers = buildMerchantCustomerList({
      orders: [
        { id: "order_1", email: "Guest@Example.test" },
        { id: "order_2", email: "guest@example.test" },
      ],
    })

    expect(customers).toHaveLength(1)
    expect(customers[0]).toEqual(
      expect.objectContaining({
        customer_id: null,
        email: "Guest@Example.test",
        order_count: 2,
      })
    )
  })
})
