import type { MedusaContainer } from "@medusajs/framework/types"
import { z } from "@medusajs/framework/zod"

import {
  listMerchantProductsWorkflow,
  retrieveMerchantProductWorkflow,
} from "../../workflows/merchant-catalog"
import {
  listMerchantInventoryWorkflow,
  retrieveMerchantHomeWorkflow,
  retrieveMerchantReportsWorkflow,
} from "../../workflows/merchant-insights"

// The assistant's only way to see store data. Every tool runs a workflow that
// is scoped to the signed-in merchant, so the model can't read another
// merchant's data whatever it asks for. All tools are read-only: the
// assistant drafts and the merchant acts.

export type StoreAssistantToolContext = {
  container: MedusaContainer
  merchant_id: string
  sales_channel_id: string
}

type StoreAssistantTool<Schema extends z.ZodType> = {
  description: string
  parameters: Schema
  execute: (
    args: z.infer<Schema>,
    context: StoreAssistantToolContext
  ) => Promise<unknown>
}

const defineTool = <Schema extends z.ZodType>(
  tool: StoreAssistantTool<Schema>
) => tool

const scopeOf = ({ merchant_id, sales_channel_id }: StoreAssistantToolContext) =>
  ({ merchant_id, sales_channel_id })

type InventoryLevel = {
  location_id?: string | null
  stocked_quantity?: number | null
  reserved_quantity?: number | null
  available_quantity?: number | null
}

export type MerchantInventoryItem = {
  id: string
  title: string
  sku: string | null
  product: { id: string; title: string }
  variant: { id: string; title: string }
  location_levels: InventoryLevel[]
}

const availableAt = (level: InventoryLevel) =>
  Number(
    level.available_quantity ??
      Number(level.stocked_quantity ?? 0) - Number(level.reserved_quantity ?? 0)
  )

// Items at or below the threshold, emptiest first. An item with no stock
// location counts as zero: customers can't buy it.
export const findLowStock = (
  items: MerchantInventoryItem[],
  threshold: number,
  limit = 25
) => {
  const low = items
    .map((item) => ({
      product_id: item.product.id,
      product: item.product.title,
      variant: item.variant.title,
      sku: item.sku,
      available: item.location_levels.reduce(
        (sum, level) => sum + availableAt(level),
        0
      ),
      stocked_at_a_location: item.location_levels.length > 0,
    }))
    .filter(({ available }) => available <= threshold)
    .sort((left, right) => left.available - right.available)

  return {
    threshold,
    total_low_stock: low.length,
    items: low.slice(0, limit),
  }
}

const getSalesSummary = defineTool({
  description:
    "Sales for a period compared with the period before it: revenue, orders, average order value, unique customers, sales by day, the top 5 products by revenue, and counts of things needing attention (orders to fulfil, payments to review, low-stock variants, unpublished products). Use for questions like 'how is my business doing'.",
  parameters: z.object({
    range: z
      .enum(["today", "7d", "30d"])
      .describe("today, the last 7 days, or the last 30 days"),
  }),
  execute: async ({ range }, context) => {
    const { result } = await retrieveMerchantHomeWorkflow(
      context.container
    ).run({ input: { ...scopeOf(context), range } })

    return {
      period: result.period,
      currency_code: result.currency_code,
      has_mixed_currencies: result.has_mixed_currencies,
      summary: result.summary,
      percent_change_vs_previous_period: result.comparison,
      sales_by_day: result.sales_by_day,
      top_products: result.top_products,
      needs_attention: result.attention.map(({ label, count }) => ({
        label,
        count,
      })),
    }
  },
})

const listLowStock = defineTool({
  description:
    "Product variants that are almost or completely out of stock, emptiest first, with units available across the merchant's stock locations.",
  parameters: z.object({
    threshold: z
      .number()
      .int()
      .min(0)
      .max(1000)
      .optional()
      .describe("Include variants with this many units or fewer. Default 5."),
  }),
  execute: async ({ threshold }, context) => {
    const { result } = await listMerchantInventoryWorkflow(
      context.container
    ).run({ input: scopeOf(context) })

    return findLowStock(
      result.inventory_items as MerchantInventoryItem[],
      threshold ?? 5
    )
  },
})

const getProductPerformance = defineTool({
  description:
    "All-time sales per product, best first by revenue, plus all-time store totals. For one period, use get_sales_summary instead.",
  parameters: z.object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe("How many products to return. Default 10."),
  }),
  execute: async ({ limit }, context) => {
    const { result } = await retrieveMerchantReportsWorkflow(
      context.container
    ).run({ input: scopeOf(context) })
    const products = result.product_performance

    return {
      currency_code: result.currency_code,
      all_time_totals: result.metrics,
      products_with_sales: products.length,
      products: products.slice(0, limit ?? 10),
    }
  },
})

const findProducts = defineTool({
  description:
    "Search the merchant's products by name. Returns ids, titles, status and current prices. Use it to find a product id before get_product_details.",
  parameters: z.object({
    query: z.string().max(100).optional().describe("Words from the product name"),
    status: z
      .enum(["draft", "proposed", "published", "rejected"])
      .optional(),
  }),
  execute: async ({ query, status }, context) => {
    const { result } = await listMerchantProductsWorkflow(
      context.container
    ).run({
      input: {
        ...scopeOf(context),
        q: query || undefined,
        status,
        limit: 20,
        offset: 0,
        order: "-created_at",
      },
    })

    return {
      count: result.count,
      products: result.products,
    }
  },
})

const getProductDetails = defineTool({
  description:
    "One product's title, description, options, variants and current prices. Use before drafting marketing copy about it.",
  parameters: z.object({
    product_id: z.string().min(1),
  }),
  execute: async ({ product_id }, context) => {
    const { result } = await retrieveMerchantProductWorkflow(
      context.container
    ).run({ input: { ...scopeOf(context), product_id } })
    const product = result as Record<string, any>

    return {
      id: product.id,
      title: product.title,
      subtitle: product.subtitle,
      description: product.description,
      status: product.status,
      handle: product.handle,
      collection: product.collection?.title ?? null,
      categories: (product.categories ?? []).map(
        (category: { name?: string }) => category.name
      ),
      options: (product.options ?? []).map(
        (option: { title: string; values?: Array<{ value: string }> }) => ({
          title: option.title,
          values: (option.values ?? []).map(({ value }) => value),
        })
      ),
      variants: (product.variants ?? []).map(
        (variant: {
          title: string
          sku?: string | null
          prices?: Array<{ amount: number; currency_code: string }>
        }) => ({
          title: variant.title,
          sku: variant.sku ?? null,
          prices: (variant.prices ?? []).map(({ amount, currency_code }) => ({
            amount,
            currency_code,
          })),
        })
      ),
      image_count: (product.images ?? []).length,
    }
  },
})

export const storeAssistantTools = {
  get_sales_summary: getSalesSummary,
  list_low_stock: listLowStock,
  get_product_performance: getProductPerformance,
  find_products: findProducts,
  get_product_details: getProductDetails,
}

export type StoreAssistantToolName = keyof typeof storeAssistantTools

export const isStoreAssistantTool = (
  name: string
): name is StoreAssistantToolName => name in storeAssistantTools

// Validates the model's arguments before running a tool. Errors come back
// as a result the model can read and recover from, not as a failed request.
export const runStoreAssistantTool = async (
  name: string,
  args: unknown,
  context: StoreAssistantToolContext
): Promise<Record<string, unknown>> => {
  if (!isStoreAssistantTool(name)) {
    return { error: `Unknown tool ${name}` }
  }

  const tool = storeAssistantTools[name] as StoreAssistantTool<z.ZodType>
  const parsed = tool.parameters.safeParse(args ?? {})

  if (!parsed.success) {
    return { error: `Invalid arguments: ${parsed.error.message}` }
  }

  try {
    return { result: await tool.execute(parsed.data, context) }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "The tool failed",
    }
  }
}

export const storeAssistantFunctionDeclarations = () =>
  Object.entries(storeAssistantTools).map(([name, tool]) => {
    const { $schema: _schemaVersion, ...parametersJsonSchema } =
      z.toJSONSchema(tool.parameters as z.ZodType)

    return {
      name,
      description: tool.description,
      parametersJsonSchema,
    }
  })
