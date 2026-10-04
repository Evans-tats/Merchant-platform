const runHome = jest.fn()
const runInventory = jest.fn()
const runOrders = jest.fn()
const runOrder = jest.fn()
const runActivity = jest.fn()
const runCustomers = jest.fn()
const runProduct = jest.fn()
const runCollection = jest.fn()
const runCustomer = jest.fn()
const runSegment = jest.fn()
const runSegments = jest.fn()

jest.mock("../../../workflows/merchant-insights", () => ({
  retrieveMerchantHomeWorkflow: () => ({ run: runHome }),
  listMerchantInventoryWorkflow: () => ({ run: runInventory }),
  retrieveMerchantReportsWorkflow: () => ({ run: jest.fn() }),
  listMerchantOrdersWorkflow: () => ({ run: runOrders }),
  retrieveMerchantOrderWorkflow: () => ({ run: runOrder }),
  listMerchantActivityWorkflow: () => ({ run: runActivity }),
}))
jest.mock("../../../workflows/merchant-catalog", () => ({
  listMerchantProductsWorkflow: () => ({ run: jest.fn() }),
  retrieveMerchantProductWorkflow: () => ({ run: runProduct }),
}))
jest.mock("../../../workflows/merchant-management", () => ({
  listMerchantCustomersWorkflow: () => ({ run: runCustomers }),
}))
jest.mock("../../../workflows/merchant-customer", () => ({
  retrieveMerchantCustomerWorkflow: () => ({ run: runCustomer }),
}))
jest.mock("../../../workflows/merchant-customer-segments", () => ({
  listMerchantCustomerSegmentsWorkflow: () => ({ run: runSegments }),
  retrieveMerchantCustomerSegmentWorkflow: () => ({ run: runSegment }),
}))
jest.mock("../../../workflows/merchant-categories", () => ({
  listMerchantCategoriesWorkflow: () => ({ run: jest.fn() }),
}))
jest.mock("../../../workflows/merchant-collections", () => ({
  listMerchantCollectionsWorkflow: () => ({ run: jest.fn() }),
  retrieveMerchantCollectionWorkflow: () => ({ run: runCollection }),
}))
jest.mock("../../../workflows/merchant-delivery", () => ({
  listMerchantDeliveryMethodsWorkflow: () => ({ run: jest.fn() }),
}))

import type { MerchantCustomerListItem } from "../../merchant-customer-list"
import type { ResolvedMerchantId } from "../../tenant-resolution"
import {
  analyzeCustomers,
  findLowStock,
  maskEmail,
  runStoreAssistantTool,
  storeAssistantFunctionDeclarations,
  summarizeCustomers,
  toCustomerDetails,
  toOrderDetails,
  type MerchantInventoryItem,
} from "../tools"

const propose = jest.fn()

const context = {
  container: {} as never,
  merchant_id: "mer_a" as ResolvedMerchantId,
  sales_channel_id: "sc_a",
  role: "owner" as const,
  propose,
}

const item = (
  title: string,
  levels: MerchantInventoryItem["location_levels"]
): MerchantInventoryItem => ({
  id: `iitem_${title}`,
  title,
  sku: null,
  product: { id: `prod_${title}`, title },
  variant: { id: `variant_${title}`, title: "Default" },
  location_levels: levels,
})

describe("findLowStock", () => {
  it("lists variants at or below the threshold, emptiest first", () => {
    const result = findLowStock(
      [
        item("Tote", [{ stocked_quantity: 9, reserved_quantity: 2 }]),
        item("Shirt", [
          { available_quantity: 1 },
          { available_quantity: 2 },
        ]),
        item("Mug", [{ available_quantity: 40 }]),
        item("Beanie", []),
      ],
      7
    )

    expect(result).toEqual({
      threshold: 7,
      total_low_stock: 3,
      items: [
        expect.objectContaining({
          product: "Beanie",
          available: 0,
          stocked_at_a_location: false,
        }),
        expect.objectContaining({ product: "Shirt", available: 3 }),
        expect.objectContaining({ product: "Tote", available: 7 }),
      ],
    })
  })

  it("caps the list but reports the full count", () => {
    const items = Array.from({ length: 30 }, (_, index) =>
      item(`Item ${index}`, [{ available_quantity: 0 }])
    )

    const result = findLowStock(items, 5)

    expect(result.total_low_stock).toBe(30)
    expect(result.items).toHaveLength(25)
  })
})

describe("maskEmail", () => {
  it("keeps the first letter and the domain only", () => {
    expect(maskEmail("jane.wanjiku@gmail.com")).toBe("j***@gmail.com")
    expect(maskEmail("  ")).toBeNull()
    expect(maskEmail(null)).toBeNull()
    expect(maskEmail("not-an-email")).toBe("***")
  })
})

const customer = (
  overrides: Partial<MerchantCustomerListItem>
): MerchantCustomerListItem => ({
  id: "cus_1",
  customer_id: "cus_1",
  merchant_profile_id: null,
  status: "active",
  email: "amina@example.com",
  first_name: "Amina",
  last_name: "Otieno",
  company_name: null,
  phone: "+254700000000",
  has_account: true,
  order_count: 1,
  placed_order_count: 1,
  total_spent: 1000,
  currency_code: "kes",
  first_order_at: "2026-09-01T00:00:00.000Z",
  last_order_at: "2026-09-01T00:00:00.000Z",
  created_at: "2026-09-01T00:00:00.000Z",
  ...overrides,
})

describe("summarizeCustomers", () => {
  const customers = [
    customer({ customer_id: "cus_new", first_name: "New", order_count: 1, last_order_at: "2026-10-03T00:00:00.000Z" }),
    customer({ customer_id: "cus_loyal", first_name: "Loyal", order_count: 6 }),
    customer({ customer_id: "cus_twice", first_name: "Twice", order_count: 2 }),
  ]

  it("sorts best buyers first and counts repeat customers", () => {
    const result = summarizeCustomers(customers, "most_orders", 2)

    expect(result.repeat_customers).toBe(2)
    expect(result.customers.map(({ customer_id }) => customer_id)).toEqual([
      "cus_loyal",
      "cus_twice",
    ])
  })

  it("never sends phone numbers or full emails", () => {
    const [first] = summarizeCustomers(customers, "recent", 1).customers

    expect(first).toEqual(
      expect.objectContaining({ name: "New Otieno", email: "a***@example.com" })
    )
    expect(JSON.stringify(first)).not.toContain("+254")
    expect(JSON.stringify(first)).not.toContain("amina@")
  })
})

describe("toOrderDetails", () => {
  it("sends the delivery area but not the street address or phone", () => {
    const details = toOrderDetails(
      {
        id: "order_1",
        display_id: 1042,
        status: "pending",
        payment_status: "captured",
        fulfillment_status: "not_fulfilled",
        total: 2500,
        currency_code: "kes",
        created_at: "2026-10-01T09:00:00.000Z",
        items: [{ product_title: "Kikoi", variant_title: "Blue", quantity: 2 }],
      },
      {
        subtotal: 2200,
        shipping_total: 300,
        total: 2500,
        items: [
          { product_title: "Kikoi", variant_title: "Blue", quantity: 2, unit_price: 1100, total: 2200 },
        ],
        shipping_methods: [{ name: "Nairobi same day" }],
        shipping_address: {
          address_1: "12 Moi Avenue",
          phone: "+254711111111",
          city: "Nairobi",
          country_code: "ke",
        } as never,
        payment_collections: [{ refunded_amount: 0 }],
        customer: { first_name: "Amina", email: "amina@example.com", has_account: true },
      }
    )

    expect(details).toMatchObject({
      order_number: 1042,
      payment_status: "captured",
      fulfillment_status: "not_fulfilled",
      items: [{ name: "Kikoi (Blue)", quantity: 2, unit_price: 1100, total: 2200 }],
      delivery: { methods: ["Nairobi same day"], area: "Nairobi, KE" },
      customer: { name: "Amina", email: "a***@example.com", registered: true },
    })
    expect(JSON.stringify(details)).not.toContain("Moi Avenue")
    expect(JSON.stringify(details)).not.toContain("+254")
  })
})

describe("toCustomerDetails", () => {
  const details = toCustomerDetails({
    id: "cus_1",
    email: "amina@example.com",
    first_name: "Amina",
    last_name: "Otieno",
    has_account: true,
    created_at: "2026-08-01T00:00:00.000Z",
    phone: "+254700000000",
    addresses: [
      { address_1: "12 Moi Avenue", city: "Nairobi", country_code: "ke" },
      { address_1: "4 Kenyatta Road", city: "Nairobi", country_code: "ke" },
      { city: "Mombasa", province: "Mombasa", country_code: "ke" },
    ],
    segments: [{ id: "cusgroup_vip", name: "VIP" }],
    orders: [
      {
        display_id: 1001,
        status: "completed",
        currency_code: "kes",
        total: 2500,
        created_at: "2026-09-01T09:00:00.000Z",
        items: [{ product_title: "Kikoi", variant_title: "Blue", quantity: 2 }],
      },
      {
        display_id: 1003,
        status: "canceled",
        currency_code: "kes",
        total: 9000,
        created_at: "2026-09-20T09:00:00.000Z",
        items: [{ product_title: "Basket", quantity: 6 }],
      },
      {
        display_id: 1002,
        status: "pending",
        currency_code: "kes",
        total: 1500,
        created_at: "2026-09-10T09:00:00.000Z",
        items: [
          { product_title: "Kikoi", variant_title: "Red", quantity: 1 },
          { product_title: "Tote", quantity: 1 },
        ],
      },
    ],
  } as never)

  it("counts what the customer spent on placed orders only", () => {
    expect(details).toMatchObject({
      customer_id: "cus_1",
      name: "Amina Otieno",
      email: "a***@example.com",
      registered: true,
      segments: [{ id: "cusgroup_vip", name: "VIP" }],
      order_count: 3,
      placed_order_count: 2,
      total_spent: 4000,
      average_order_value: 2000,
      currency_code: "kes",
      has_mixed_currencies: false,
      first_order_at: "2026-09-01T09:00:00.000Z",
      last_order_at: "2026-09-20T09:00:00.000Z",
      top_products: [
        { name: "Kikoi", quantity: 3 },
        { name: "Tote", quantity: 1 },
      ],
    })
    expect(details.recent_orders.map(({ order_number }) => order_number)).toEqual(
      [1003, 1002, 1001]
    )
  })

  it("sends delivery areas, never streets, phones or full emails", () => {
    expect(details.delivery_areas).toEqual(["Nairobi, KE", "Mombasa, Mombasa, KE"])
    const sent = JSON.stringify(details)
    expect(sent).not.toContain("Moi Avenue")
    expect(sent).not.toContain("+254")
    expect(sent).not.toContain("amina@")
  })
})

describe("analyzeCustomers", () => {
  const now = new Date("2026-10-04T00:00:00.000Z")
  const daysAgo = (days: number) =>
    new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString()
  const customers = [
    customer({
      customer_id: "cus_lapsed",
      first_name: "Lapsed",
      placed_order_count: 4,
      total_spent: 12000,
      first_order_at: daysAgo(300),
      last_order_at: daysAgo(120),
    }),
    customer({
      customer_id: "cus_loyal",
      first_name: "Loyal",
      placed_order_count: 3,
      total_spent: 6000,
      first_order_at: daysAgo(200),
      last_order_at: daysAgo(5),
    }),
    customer({
      customer_id: "cus_new",
      first_name: "New",
      placed_order_count: 1,
      total_spent: 1500,
      first_order_at: daysAgo(3),
      last_order_at: daysAgo(3),
    }),
    customer({
      customer_id: "cus_once",
      first_name: "Once",
      placed_order_count: 1,
      total_spent: 500,
      first_order_at: daysAgo(60),
      last_order_at: daysAgo(60),
    }),
    customer({
      customer_id: "cus_canceled",
      first_name: "Canceled",
      order_count: 1,
      placed_order_count: 0,
      total_spent: 0,
      currency_code: null,
      first_order_at: daysAgo(10),
      last_order_at: daysAgo(10),
    }),
  ]

  it("counts each group and the store's customer revenue", () => {
    expect(analyzeCustomers(customers, { limit: 10, now })).toEqual({
      customers: 5,
      buyers: 4,
      no_placed_orders: 1,
      revenue: 20000,
      placed_orders: 9,
      average_order_value: 2222.22,
      average_spent_per_buyer: 5000,
      repeat_buyer_percent: 50,
      currency_code: "kes",
      has_mixed_currencies: false,
      groups: [
        { group: "repeat", definition: "2 or more orders", customers: 2 },
        { group: "one_time", definition: "exactly 1 order", customers: 2 },
        { group: "new", definition: "first order in the last 30 days", customers: 1 },
        {
          group: "lapsed",
          definition: "2 or more orders, but none in the last 90 days",
          customers: 1,
        },
      ],
    })
  })

  it("lists one group's customers, masked, in the group's order", () => {
    const top = analyzeCustomers(customers, {
      group: "top_spenders",
      limit: 2,
      now,
    })

    expect(top.group).toMatchObject({ total: 4 })
    expect(top.group?.customers).toEqual([
      expect.objectContaining({
        customer_id: "cus_lapsed",
        email: "a***@example.com",
        placed_orders: 4,
        total_spent: 12000,
        days_since_last_order: 120,
      }),
      expect.objectContaining({ customer_id: "cus_loyal" }),
    ])
    expect(JSON.stringify(top)).not.toContain("+254")
  })

  it("uses the given window for new and lapsed customers", () => {
    const lapsed = analyzeCustomers(customers, {
      group: "lapsed",
      days: 3,
      limit: 10,
      now,
    })

    expect(lapsed.group).toMatchObject({
      definition: "2 or more orders, but none in the last 3 days",
      customers: [{ customer_id: "cus_lapsed" }, { customer_id: "cus_loyal" }],
    })
    // The other group keeps its default window.
    expect(lapsed.groups[2]).toEqual({
      group: "new",
      definition: "first order in the last 30 days",
      customers: 1,
    })
  })

  it("flags revenue that mixes currencies", () => {
    const mixed = analyzeCustomers(
      [customer({ currency_code: "kes" }), customer({ currency_code: "usd" })],
      { limit: 10, now }
    )

    expect(mixed).toMatchObject({ currency_code: null, has_mixed_currencies: true })
  })
})

describe("runStoreAssistantTool", () => {
  beforeEach(() => {
    runHome.mockReset()
    runInventory.mockReset()
    runOrders.mockReset()
    runOrder.mockReset()
    runActivity.mockReset()
    runCustomers.mockReset()
    runProduct.mockReset()
    runCollection.mockReset()
    runCustomer.mockReset()
    runSegment.mockReset()
    runSegments.mockReset()
    propose.mockReset()
  })

  it("lists orders that need fulfillment with the dashboard's rules", async () => {
    runOrders.mockResolvedValueOnce({
      result: {
        orders: [
          { id: "o1", display_id: 1, status: "pending", fulfillment_status: "not_fulfilled", payment_status: "captured" },
          { id: "o2", display_id: 2, status: "completed", fulfillment_status: "fulfilled", payment_status: "captured" },
          { id: "o3", display_id: 3, status: "pending", fulfillment_status: "partially_fulfilled", payment_status: "captured" },
        ],
        count: 3,
      },
    })

    const response = await runStoreAssistantTool(
      "list_orders",
      { needs: "fulfillment" },
      context
    )

    expect(runOrders).toHaveBeenCalledWith({
      input: {
        merchant_id: "mer_a",
        sales_channel_id: "sc_a",
        placed_only: true,
        limit: 500,
        offset: 0,
      },
    })
    expect(response).toMatchObject({
      result: {
        total_matching: 2,
        orders: [{ order_number: 1 }, { order_number: 3 }],
      },
    })
    expect(response.result).not.toHaveProperty("note")
  })

  it("finds an order by its number within the merchant's orders", async () => {
    runOrders.mockResolvedValueOnce({ result: { orders: [], count: 0 } })

    await expect(
      runStoreAssistantTool("get_order_details", { order_number: 77 }, context)
    ).resolves.toEqual({ error: "There is no order #77 in this store" })
    expect(runOrders).toHaveBeenCalledWith({
      input: expect.objectContaining({ merchant_id: "mer_a", display_id: 77 }),
    })
    expect(runOrder).not.toHaveBeenCalled()
  })

  it("asks for activity since the start of the period", async () => {
    runActivity.mockResolvedValueOnce({
      result: {
        activities: [
          { action: "catalog.category_created", description: "Created category Shoes", created_at: "2026-10-02T10:00:00.000Z" },
        ],
        notifications: [],
      },
    })
    const before = Date.now()

    const response = await runStoreAssistantTool(
      "get_recent_activity",
      { days: 3 },
      context
    )

    const { since, limit } = runActivity.mock.calls[0][0].input
    const threeDays = 3 * 24 * 60 * 60 * 1000
    expect(limit).toBe(50)
    expect(new Date(since).getTime()).toBeGreaterThanOrEqual(before - threeDays)
    expect(new Date(since).getTime()).toBeLessThanOrEqual(Date.now() - threeDays)
    expect(response).toMatchObject({
      result: { activities: [{ description: "Created category Shoes" }] },
    })
  })

  it("runs workflows in the signed-in merchant's scope", async () => {
    runHome.mockResolvedValueOnce({
      result: {
        period: { label: "Last 7 days" },
        currency_code: "kes",
        has_mixed_currencies: false,
        summary: { sales: 8420, orders: 214 },
        comparison: { sales: 12 },
        sales_by_day: [],
        top_products: [],
        attention: [{ id: "inventory", label: "Low-stock variants", count: 3, to: "/x" }],
      },
    })

    const response = await runStoreAssistantTool(
      "get_sales_summary",
      { range: "7d" },
      context
    )

    expect(runHome).toHaveBeenCalledWith({
      input: { merchant_id: "mer_a", sales_channel_id: "sc_a", range: "7d" },
    })
    expect(response).toMatchObject({
      result: {
        summary: { sales: 8420, orders: 214 },
        percent_change_vs_previous_period: { sales: 12 },
        needs_attention: [{ label: "Low-stock variants", count: 3 }],
      },
    })
  })

  it("ignores a merchant id the model tries to pass", async () => {
    runInventory.mockResolvedValueOnce({
      result: { stock_locations: [], inventory_items: [] },
    })

    await runStoreAssistantTool(
      "list_low_stock",
      { threshold: 3, merchant_id: "mer_b" },
      context
    )

    expect(runInventory).toHaveBeenCalledWith({
      input: { merchant_id: "mer_a", sales_channel_id: "sc_a" },
    })
  })

  it("returns errors to the model instead of throwing", async () => {
    runHome.mockRejectedValueOnce(new Error("Merchant commerce scope not found"))

    await expect(
      runStoreAssistantTool("get_sales_summary", { range: "7d" }, context)
    ).resolves.toEqual({ error: "Merchant commerce scope not found" })
    await expect(
      runStoreAssistantTool("get_sales_summary", { range: "1y" }, context)
    ).resolves.toEqual({ error: expect.stringContaining("Invalid arguments") })
    await expect(
      runStoreAssistantTool("run_sql", {}, context)
    ).resolves.toEqual({ error: "Unknown tool run_sql" })
  })

  it("suggests an order note without changing the order", async () => {
    runOrders.mockResolvedValueOnce({
      result: { orders: [{ id: "order_1", display_id: 1042 }], count: 1 },
    })
    propose.mockResolvedValueOnce({ id: "agprop_1" })

    const response = await runStoreAssistantTool(
      "propose_order_note",
      {
        order_number: 1042,
        note: "  Customer asked for gift wrapping  ",
        summary: "They mentioned it's a gift.",
        order_id: "order_of_another_merchant",
      },
      context
    )

    expect(runOrders).toHaveBeenCalledWith({
      input: expect.objectContaining({ merchant_id: "mer_a", display_id: 1042 }),
    })
    expect(propose).toHaveBeenCalledWith({
      action: "add_order_note",
      args: { order_id: "order_1", note: "Customer asked for gift wrapping" },
      preview: { order_number: 1042 },
      summary: "They mentioned it's a gift.",
    })
    expect(response).toEqual({
      result: expect.objectContaining({
        proposal_id: "agprop_1",
        status: "waiting_for_owner",
      }),
    })
  })

  it("won't suggest a note on an order outside the store", async () => {
    runOrders.mockResolvedValueOnce({ result: { orders: [], count: 0 } })

    await expect(
      runStoreAssistantTool(
        "propose_order_note",
        { order_number: 77, note: "Call the customer", summary: "Follow up" },
        context
      )
    ).resolves.toEqual({ error: "There is no order #77 in this store" })
    expect(propose).not.toHaveBeenCalled()
  })

  const product = (overrides: Record<string, unknown> = {}) => ({
    result: {
      id: "prod_1",
      title: "Kikoi",
      description: "A cotton kikoi.",
      status: "draft",
      collection: null,
      variants: [
        { title: "Blue", prices: [{ amount: 1100, currency_code: "kes" }] },
      ],
      ...overrides,
    },
  })

  it("suggests publishing a draft product", async () => {
    runProduct.mockResolvedValueOnce(product())
    propose.mockResolvedValueOnce({ id: "agprop_1" })

    const response = await runStoreAssistantTool(
      "propose_publish_product",
      { product_id: "prod_1", summary: "It has photos and prices." },
      context
    )

    expect(runProduct).toHaveBeenCalledWith({
      input: { merchant_id: "mer_a", sales_channel_id: "sc_a", product_id: "prod_1" },
    })
    expect(propose).toHaveBeenCalledWith({
      action: "publish_product",
      args: { product_id: "prod_1" },
      preview: { title: "Kikoi", status: "draft" },
      summary: "It has photos and prices.",
    })
    expect(response).toMatchObject({ result: { status: "waiting_for_owner" } })
  })

  it("won't suggest publishing a product without prices or one already live", async () => {
    runProduct
      .mockResolvedValueOnce(
        product({
          variants: [
            { title: "Blue", prices: [{ amount: 1100, currency_code: "kes" }] },
            { title: "Red", prices: [] },
          ],
        })
      )
      .mockResolvedValueOnce(product({ status: "published" }))
    const args = { product_id: "prod_1", summary: "Ready to sell." }

    await expect(
      runStoreAssistantTool("propose_publish_product", args, context)
    ).resolves.toEqual({
      error:
        "Kikoi can't be published yet: Red has no price. The owner has to add prices first.",
    })
    await expect(
      runStoreAssistantTool("propose_publish_product", args, context)
    ).resolves.toEqual({ error: "Kikoi is already published" })
    expect(propose).not.toHaveBeenCalled()
  })

  it("suggests a description next to the current one", async () => {
    runProduct.mockResolvedValueOnce(product({ description: "  Old text. " }))
    propose.mockResolvedValueOnce({ id: "agprop_2" })

    await runStoreAssistantTool(
      "propose_product_description",
      {
        product_id: "prod_1",
        description: " Soft cotton kikoi in blue. ",
        summary: "The current one is very short.",
      },
      context
    )

    expect(propose).toHaveBeenCalledWith({
      action: "update_product_description",
      args: { product_id: "prod_1", description: "Soft cotton kikoi in blue." },
      preview: { title: "Kikoi", current_description: "Old text." },
      summary: "The current one is very short.",
    })
  })

  it("suggests adding only products not yet in the collection", async () => {
    runCollection.mockResolvedValueOnce({
      result: { id: "pcol_1", title: "Summer", products: [{ id: "prod_in" }] },
    })
    runProduct
      .mockResolvedValueOnce(
        product({ id: "prod_1", collection: { id: "pcol_bags", title: "Bags" } })
      )
      .mockResolvedValueOnce(product({ id: "prod_in", title: "Tote" }))
    propose.mockResolvedValueOnce({ id: "agprop_3" })

    const response = await runStoreAssistantTool(
      "propose_collection_products",
      {
        collection_id: "pcol_1",
        product_ids: ["prod_1", "prod_in", "prod_1"],
        summary: "Both are summer items.",
      },
      context
    )

    expect(runCollection).toHaveBeenCalledWith({
      input: { merchant_id: "mer_a", sales_channel_id: "sc_a", collection_id: "pcol_1" },
    })
    expect(runProduct).toHaveBeenCalledTimes(2)
    expect(propose).toHaveBeenCalledWith({
      action: "add_collection_products",
      args: { collection_id: "pcol_1", product_ids: ["prod_1"] },
      preview: {
        collection_title: "Summer",
        products: [{ id: "prod_1", title: "Kikoi", current_collection: "Bags" }],
      },
      summary: "Both are summer items.",
    })
    expect(response).toMatchObject({
      result: {
        already_in_collection: ["Tote"],
        would_leave_their_current_collection: ["Kikoi (now in Bags)"],
      },
    })
  })

  it("keeps catalog suggestions from staff, who can't approve them", async () => {
    await expect(
      runStoreAssistantTool(
        "propose_publish_product",
        { product_id: "prod_1", summary: "Ready." },
        { ...context, role: "staff" }
      )
    ).resolves.toEqual({ error: "Unknown tool propose_publish_product" })
    expect(runProduct).not.toHaveBeenCalled()
  })

  it("reads one customer in the signed-in merchant's scope", async () => {
    runCustomer.mockResolvedValueOnce({
      result: { id: "cus_1", first_name: "Amina", email: "amina@example.com", orders: [] },
    })

    const response = await runStoreAssistantTool(
      "get_customer_details",
      { customer_id: "cus_1", merchant_id: "mer_b" },
      context
    )

    expect(runCustomer).toHaveBeenCalledWith({
      input: { merchant_id: "mer_a", customer_id: "cus_1" },
    })
    expect(response).toMatchObject({
      result: { customer_id: "cus_1", name: "Amina", email: "a***@example.com" },
    })
  })

  const storeCustomers = () => ({
    result: {
      customers: [
        customer({ customer_id: "cus_vip", first_name: "Vip", placed_order_count: 3, total_spent: 9000 }),
        customer({ customer_id: "cus_other", first_name: "Other", total_spent: 1000 }),
        customer({ customer_id: null, id: "email:guest@example.com", first_name: null, last_name: null, email: "guest@example.com" }),
      ],
      count: 3,
    },
  })

  const segment = (members: string[]) => ({
    result: {
      id: "cusgroup_vip",
      name: "VIP",
      customers: members.map((id) => ({ id })),
    },
  })

  it("analyzes every customer, and compares a segment with the store", async () => {
    runCustomers.mockResolvedValue(storeCustomers())
    runSegment.mockResolvedValueOnce(segment(["cus_vip"]))

    const whole = await runStoreAssistantTool("analyze_customers", {}, context)
    const vip = await runStoreAssistantTool(
      "analyze_customers",
      { segment_id: "cusgroup_vip", group: "top_spenders" },
      context
    )

    expect(runCustomers).toHaveBeenCalledWith({
      input: {
        merchant_id: "mer_a",
        sales_channel_id: "sc_a",
        limit: Number.MAX_SAFE_INTEGER,
        offset: 0,
      },
    })
    expect(runSegment).toHaveBeenCalledWith({
      input: { merchant_id: "mer_a", sales_channel_id: "sc_a", segment_id: "cusgroup_vip" },
    })
    expect(whole.result).toMatchObject({ customers: 3, buyers: 3, revenue: 11000 })
    expect(vip.result).toMatchObject({
      segment: {
        id: "cusgroup_vip",
        name: "VIP",
        share_of_store_revenue_percent: 82,
        share_of_store_buyers_percent: 33,
      },
      customers: 1,
      revenue: 9000,
      group: { total: 1, customers: [{ customer_id: "cus_vip" }] },
    })
  })

  it("suggests segment changes for the customers that would change", async () => {
    runSegment.mockResolvedValueOnce(segment(["cus_vip"]))
    runCustomers.mockResolvedValueOnce(storeCustomers())
    propose.mockResolvedValueOnce({ id: "agprop_4" })

    const response = await runStoreAssistantTool(
      "propose_segment_customers",
      {
        segment_id: "cusgroup_vip",
        add: ["cus_other", "cus_vip", "cus_other"],
        remove: [],
        summary: "Other is a regular now.",
      },
      context
    )

    expect(propose).toHaveBeenCalledWith({
      action: "update_segment_customers",
      args: { segment_id: "cusgroup_vip", add: ["cus_other"], remove: [] },
      preview: {
        segment_name: "VIP",
        customers: [{ id: "cus_other", name: "Other Otieno", email: "a***@example.com" }],
      },
      summary: "Other is a regular now.",
    })
    expect(response).toMatchObject({
      result: {
        status: "waiting_for_owner",
        already_in_segment: ["Vip Otieno"],
        not_in_segment: [],
      },
    })
  })

  it("won't suggest segment changes for unknown customers or no change", async () => {
    runSegment.mockResolvedValue(segment(["cus_vip"]))
    runCustomers.mockResolvedValue(storeCustomers())

    await expect(
      runStoreAssistantTool(
        "propose_segment_customers",
        { segment_id: "cusgroup_vip", add: ["cus_of_merchant_b", "email:guest@example.com"], summary: "Add them." },
        context
      )
    ).resolves.toEqual({
      error:
        "Not customers of this store: cus_of_merchant_b, email:guest@example.com. Use customer ids from list_customers or analyze_customers.",
    })
    await expect(
      runStoreAssistantTool(
        "propose_segment_customers",
        { segment_id: "cusgroup_vip", add: ["cus_vip"], remove: ["cus_other"], summary: "Tidy up." },
        context
      )
    ).resolves.toEqual({
      error:
        "Nothing would change in VIP: the customers to add are already in it and the customers to remove aren't",
    })
    expect(propose).not.toHaveBeenCalled()
  })

  it("suggests a new segment unless one has that name", async () => {
    runSegments.mockResolvedValue({
      result: { customer_segments: [{ id: "cusgroup_vip", name: "VIP" }], count: 1 },
    })
    runCustomers.mockResolvedValue(storeCustomers())
    propose.mockResolvedValueOnce({ id: "agprop_5" })

    await expect(
      runStoreAssistantTool(
        "propose_create_segment",
        { name: " vip ", customer_ids: ["cus_other"], summary: "Group the best." },
        context
      )
    ).resolves.toEqual({
      error:
        "There's already a segment called VIP (id cusgroup_vip). To add customers to it, use propose_segment_customers.",
    })

    await runStoreAssistantTool(
      "propose_create_segment",
      {
        name: "  Lapsed   regulars ",
        description: "Bought twice or more, not in 90 days.",
        customer_ids: ["cus_vip", "cus_vip"],
        summary: "Win them back.",
      },
      context
    )

    expect(propose).toHaveBeenCalledWith({
      action: "create_segment",
      args: {
        name: "Lapsed regulars",
        description: "Bought twice or more, not in 90 days.",
        customer_ids: ["cus_vip"],
      },
      preview: {
        customers: [{ id: "cus_vip", name: "Vip Otieno", email: "a***@example.com" }],
      },
      summary: "Win them back.",
    })
  })

  it("keeps segment suggestions from staff, who can't approve them", async () => {
    for (const tool of ["propose_segment_customers", "propose_create_segment"]) {
      await expect(
        runStoreAssistantTool(
          tool,
          { segment_id: "cusgroup_vip", name: "VIP", add: ["cus_1"], summary: "Group them." },
          { ...context, role: "staff" }
        )
      ).resolves.toEqual({ error: `Unknown tool ${tool}` })
    }
    expect(runCustomers).not.toHaveBeenCalled()
  })

  it("describes every tool to the model with a JSON schema", () => {
    const declarations = storeAssistantFunctionDeclarations()

    expect(declarations.map(({ name }) => name)).toEqual([
      "get_sales_summary",
      "list_low_stock",
      "get_product_performance",
      "find_products",
      "get_product_details",
      "list_orders",
      "get_order_details",
      "list_customers",
      "list_customer_segments",
      "get_customer_details",
      "analyze_customers",
      "get_catalog_structure",
      "list_delivery_methods",
      "get_recent_activity",
      "propose_order_note",
      "propose_publish_product",
      "propose_product_description",
      "propose_collection_products",
      "propose_segment_customers",
      "propose_create_segment",
    ])
    expect(storeAssistantFunctionDeclarations("admin")).toEqual(declarations)
    // Staff can add order notes but not change the catalog or segments.
    expect(
      storeAssistantFunctionDeclarations("staff").map(({ name }) => name)
    ).toEqual(
      declarations
        .map(({ name }) => name)
        .filter(
          (name) =>
            ![
              "propose_publish_product",
              "propose_product_description",
              "propose_collection_products",
              "propose_segment_customers",
              "propose_create_segment",
            ].includes(name)
        )
    )
    for (const declaration of declarations) {
      expect(declaration.parametersJsonSchema).toMatchObject({ type: "object" })
      expect(declaration.parametersJsonSchema).not.toHaveProperty("$schema")
    }
  })
})
