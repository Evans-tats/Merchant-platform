const runHome = jest.fn()
const runInventory = jest.fn()

jest.mock("../../../workflows/merchant-insights", () => ({
  retrieveMerchantHomeWorkflow: () => ({ run: runHome }),
  listMerchantInventoryWorkflow: () => ({ run: runInventory }),
  retrieveMerchantReportsWorkflow: () => ({ run: jest.fn() }),
}))
jest.mock("../../../workflows/merchant-catalog", () => ({
  listMerchantProductsWorkflow: () => ({ run: jest.fn() }),
  retrieveMerchantProductWorkflow: () => ({ run: jest.fn() }),
}))

import {
  findLowStock,
  runStoreAssistantTool,
  storeAssistantFunctionDeclarations,
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

describe("runStoreAssistantTool", () => {
  beforeEach(() => {
    runHome.mockReset()
    runInventory.mockReset()
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
    ])
    for (const declaration of declarations) {
      expect(declaration.parametersJsonSchema).toMatchObject({ type: "object" })
      expect(declaration.parametersJsonSchema).not.toHaveProperty("$schema")
    }
  })
})
