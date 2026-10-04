const runHome = jest.fn()
const runInventory = jest.fn()
const runOrders = jest.fn()
const runOrder = jest.fn()
const runActivity = jest.fn()
const runCustomers = jest.fn()

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
  retrieveMerchantProductWorkflow: () => ({ run: jest.fn() }),
}))
jest.mock("../../../workflows/merchant-management", () => ({
  listMerchantCustomersWorkflow: () => ({ run: runCustomers }),
}))
jest.mock("../../../workflows/merchant-customer-segments", () => ({
  listMerchantCustomerSegmentsWorkflow: () => ({ run: jest.fn() }),
}))
jest.mock("../../../workflows/merchant-categories", () => ({
  listMerchantCategoriesWorkflow: () => ({ run: jest.fn() }),
}))
jest.mock("../../../workflows/merchant-collections", () => ({
  listMerchantCollectionsWorkflow: () => ({ run: jest.fn() }),
}))
jest.mock("../../../workflows/merchant-delivery", () => ({
  listMerchantDeliveryMethodsWorkflow: () => ({ run: jest.fn() }),
}))

import type { MerchantCustomerListItem } from "../../merchant-customer-list"
import {
  findLowStock,
  maskEmail,
  runStoreAssistantTool,
  storeAssistantFunctionDeclarations,
  summarizeCustomers,
  toOrderDetails,
  type MerchantInventoryItem,
} from "../tools"

const context = {
  container: {} as never,
  merchant_id: "mer_a",
  sales_channel_id: "sc_a",
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

describe("runStoreAssistantTool", () => {
  beforeEach(() => {
    runHome.mockReset()
    runInventory.mockReset()
    runOrders.mockReset()
    runOrder.mockReset()
    runActivity.mockReset()
    runCustomers.mockReset()
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
      "get_catalog_structure",
      "list_delivery_methods",
      "get_recent_activity",
    ])
    for (const declaration of declarations) {
      expect(declaration.parametersJsonSchema).toMatchObject({ type: "object" })
      expect(declaration.parametersJsonSchema).not.toHaveProperty("$schema")
    }
  })
})
