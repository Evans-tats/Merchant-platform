import { buildMerchantHome, resolveMerchantHomePeriod } from "../merchant-home"

const merchant = {
  id: "mer_01",
  name: "Neema Fashion",
  slug: "neema-fashion",
  status: "active",
  domains: [
    {
      hostname: "neema.example.com",
      status: "active",
      is_primary: true,
    },
  ],
  payment_configs: [
    {
      provider: "mpesa_stk",
      mode: "production",
      status: "active",
    },
  ],
  stock_locations: [{ id: "sloc_01" }],
  products: [
    {
      id: "prod_01",
      title: "Running shoe",
      status: "published",
      variants: [],
    },
  ],
}

describe("merchant home", () => {
  it("builds merchant-scoped performance and health data", () => {
    const period = resolveMerchantHomePeriod(
      "7d",
      new Date("2026-09-27T09:00:00.000Z"),
    )
    const currentOrder = {
      id: "order_01",
      display_id: 1,
      status: "completed",
      fulfillment_status: "not_fulfilled",
      payment_status: "captured",
      currency_code: "kes",
      total: 2500,
      customer_id: "cus_01",
      created_at: "2026-09-26T09:00:00.000Z",
      items: [
        {
          product_id: "prod_01",
          product_title: "Running shoe",
          quantity: 2,
          total: 2500,
        },
      ],
    }
    const previousOrder = {
      ...currentOrder,
      id: "order_00",
      display_id: 0,
      total: 1000,
      created_at: "2026-09-18T09:00:00.000Z",
    }
    const result = buildMerchantHome({
      merchant,
      period,
      period_orders: [currentOrder, previousOrder],
      attention_orders: [currentOrder],
      recent_orders: [currentOrder],
    })

    expect(result.summary).toEqual({
      sales: 2500,
      orders: 1,
      average_order_value: 2500,
      customers: 1,
    })
    expect(result.comparison.sales).toBe(150)
    expect(result.top_products[0]).toMatchObject({
      product_id: "prod_01",
      quantity: 2,
      revenue: 2500,
    })
    expect(result.attention[0].count).toBe(1)
    expect(result.store_health.status).toBe("live")
    expect(result.onboarding.visible).toBe(false)
  })

  it("does not combine multiple currencies into one sales total", () => {
    const period = resolveMerchantHomePeriod(
      "today",
      new Date("2026-09-27T09:00:00.000Z"),
    )
    const result = buildMerchantHome({
      merchant,
      period,
      period_orders: [
        {
          id: "order_kes",
          display_id: 1,
          status: "completed",
          currency_code: "kes",
          total: 1000,
          created_at: "2026-09-27T08:00:00.000Z",
        },
        {
          id: "order_usd",
          display_id: 2,
          status: "completed",
          currency_code: "usd",
          total: 50,
          created_at: "2026-09-27T08:30:00.000Z",
        },
      ],
      attention_orders: [],
      recent_orders: [],
    })

    expect(result.currency_code).toBe("kes")
    expect(result.summary.sales).toBe(1000)
    expect(result.summary.orders).toBe(1)
    expect(result.has_mixed_currencies).toBe(true)
  })

  it("links View storefront through the deployment's storefront template", () => {
    const original = process.env.STOREFRONT_URL_TEMPLATE
    process.env.STOREFRONT_URL_TEMPLATE = "http://{hostname}:8000"

    try {
      const result = buildMerchantHome({
        merchant,
        period: resolveMerchantHomePeriod(
          "7d",
          new Date("2026-09-27T09:00:00.000Z"),
        ),
        period_orders: [],
        attention_orders: [],
        recent_orders: [],
      })

      expect(result.store_health.storefront_url).toBe(
        "http://neema.example.com:8000",
      )
    } finally {
      process.env.STOREFRONT_URL_TEMPLATE = original
    }
  })
})
