import type { MedusaContainer } from "@medusajs/framework/types"
import { MedusaError } from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"

import {
  listMerchantProductsWorkflow,
  retrieveMerchantProductWorkflow,
} from "../../workflows/merchant-catalog"
import { listMerchantCategoriesWorkflow } from "../../workflows/merchant-categories"
import { listMerchantCollectionsWorkflow } from "../../workflows/merchant-collections"
import { listMerchantCustomerSegmentsWorkflow } from "../../workflows/merchant-customer-segments"
import { listMerchantDeliveryMethodsWorkflow } from "../../workflows/merchant-delivery"
import {
  listMerchantActivityWorkflow,
  listMerchantInventoryWorkflow,
  listMerchantOrdersWorkflow,
  retrieveMerchantHomeWorkflow,
  retrieveMerchantOrderWorkflow,
  retrieveMerchantReportsWorkflow,
  type MerchantOrderListItem,
} from "../../workflows/merchant-insights"
import { listMerchantCustomersWorkflow } from "../../workflows/merchant-management"
import type { MerchantCustomerListItem } from "../merchant-customer-list"
import { needsFulfillment, needsPaymentReview } from "../merchant-home"

// The assistant's only way to see store data. Every tool runs a workflow that
// is scoped to the signed-in merchant, so the model can't read another
// merchant's data whatever it asks for. All tools are read-only: the
// assistant drafts and the merchant acts.
//
// Customer data goes to a third-party model, so tools send names and order
// history but mask emails and leave out phone numbers and street addresses.

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

// "jane@gmail.com" becomes "j***@gmail.com": enough to tell customers apart
// without sending the address to the model.
export const maskEmail = (email?: string | null) => {
  const trimmed = email?.trim()

  if (!trimmed) {
    return null
  }

  const at = trimmed.lastIndexOf("@")

  return at < 1 ? "***" : `${trimmed[0]}***${trimmed.slice(at)}`
}

type PersonName = {
  first_name?: string | null
  last_name?: string | null
}

const fullName = (person?: PersonName | null) =>
  [person?.first_name, person?.last_name]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ") || null

const isoDate = (value?: Date | string | null) => {
  if (!value) {
    return null
  }

  const date = value instanceof Date ? value : new Date(value)

  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

type OrderItemSource = {
  title?: string | null
  product_title?: string | null
  variant_title?: string | null
  quantity?: number | null
}

const itemName = (item: OrderItemSource) => {
  const name = item.product_title || item.title || "Unknown product"

  return item.variant_title ? `${name} (${item.variant_title})` : name
}

export const toOrderSummary = (order: MerchantOrderListItem) => {
  const items = order.items ?? []

  return {
    order_number: order.display_id ?? null,
    placed_at: isoDate(order.created_at),
    status: order.status,
    payment_status: order.payment_status ?? null,
    fulfillment_status: order.fulfillment_status ?? null,
    total: Number(order.total ?? 0),
    currency_code: order.currency_code ?? null,
    customer:
      fullName(order.customer) ??
      maskEmail(order.customer?.email ?? order.email) ??
      "Guest",
    item_count: items.reduce((sum, item) => sum + Number(item.quantity ?? 0), 0),
    items: items
      .slice(0, 5)
      .map((item) => `${Number(item.quantity ?? 0)} x ${itemName(item)}`),
  }
}

type OrderDetailSource = {
  subtotal?: number | null
  shipping_total?: number | null
  discount_total?: number | null
  tax_total?: number | null
  total?: number | null
  items?: Array<OrderItemSource & {
    unit_price?: number | null
    total?: number | null
  }>
  shipping_methods?: Array<{ name?: string | null }>
  shipping_address?: {
    city?: string | null
    province?: string | null
    country_code?: string | null
  } | null
  fulfillments?: Array<{
    created_at?: Date | string | null
    shipped_at?: Date | string | null
    delivered_at?: Date | string | null
    canceled_at?: Date | string | null
  }>
  payment_collections?: Array<{ refunded_amount?: number | null }>
  customer?: (PersonName & {
    email?: string | null
    has_account?: boolean | null
  }) | null
  email?: string | null
}

// The summary row supplies the statuses Medusa works out from payments and
// fulfillments. The detail adds line items, totals and delivery. Only the
// delivery area is sent, never the street address or phone number.
export const toOrderDetails = (
  summary: MerchantOrderListItem,
  order: OrderDetailSource
) => {
  const address = order.shipping_address

  return {
    ...toOrderSummary(summary),
    items: (order.items ?? []).map((item) => ({
      name: itemName(item),
      quantity: Number(item.quantity ?? 0),
      unit_price: Number(item.unit_price ?? 0),
      total: Number(item.total ?? 0),
    })),
    subtotal: Number(order.subtotal ?? 0),
    shipping_total: Number(order.shipping_total ?? 0),
    discount_total: Number(order.discount_total ?? 0),
    tax_total: Number(order.tax_total ?? 0),
    total: Number(order.total ?? summary.total ?? 0),
    amount_refunded: (order.payment_collections ?? []).reduce(
      (sum, collection) => sum + Number(collection.refunded_amount ?? 0),
      0
    ),
    delivery: {
      methods: (order.shipping_methods ?? [])
        .map(({ name }) => name)
        .filter(Boolean),
      area:
        [address?.city, address?.province, address?.country_code?.toUpperCase()]
          .map((part) => part?.trim())
          .filter(Boolean)
          .join(", ") || null,
    },
    fulfillments: (order.fulfillments ?? []).map((fulfillment) => ({
      created_at: isoDate(fulfillment.created_at),
      shipped_at: isoDate(fulfillment.shipped_at),
      delivered_at: isoDate(fulfillment.delivered_at),
      canceled_at: isoDate(fulfillment.canceled_at),
    })),
    customer: {
      name: fullName(order.customer),
      email: maskEmail(order.customer?.email ?? order.email),
      registered: order.customer?.has_account === true,
    },
  }
}

export const summarizeCustomers = (
  customers: MerchantCustomerListItem[],
  sort: "recent" | "most_orders",
  limit: number
) => {
  // The workflow already lists the most recent buyers first.
  const sorted =
    sort === "most_orders"
      ? [...customers].sort(
          (left, right) =>
            right.order_count - left.order_count ||
            (right.last_order_at ?? "").localeCompare(left.last_order_at ?? "")
        )
      : customers

  return {
    repeat_customers: customers.filter(({ order_count }) => order_count >= 2)
      .length,
    customers: sorted.slice(0, limit).map((customer) => ({
      customer_id: customer.customer_id,
      name: fullName(customer) ?? customer.company_name,
      email: maskEmail(customer.email),
      registered: customer.has_account,
      order_count: customer.order_count,
      first_order_at: customer.first_order_at,
      last_order_at: customer.last_order_at,
    })),
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

// Orders that need attention can be old, so the needs filters check this many
// recent placed orders instead of one page.
const ATTENTION_SCAN_LIMIT = 500

const listOrders = defineTool({
  description:
    "The store's orders, newest first: order number, date, customer, items, total, payment status and fulfillment status. Set needs to 'fulfillment' for orders still to be packed or shipped, or 'payment_review' for orders whose payment isn't complete. These match the counts on the home page.",
  parameters: z.object({
    needs: z
      .enum(["fulfillment", "payment_review"])
      .optional()
      .describe("Only orders that need this. Leave out for all orders."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe("How many orders to return. Default 10."),
  }),
  execute: async ({ needs, limit }, context) => {
    const take = limit ?? 10

    if (!needs) {
      const { result } = await listMerchantOrdersWorkflow(
        context.container
      ).run({ input: { ...scopeOf(context), limit: take, offset: 0 } })

      return {
        total_orders: result.count,
        orders: result.orders.map(toOrderSummary),
      }
    }

    const { result } = await listMerchantOrdersWorkflow(context.container).run({
      input: {
        ...scopeOf(context),
        placed_only: true,
        limit: ATTENTION_SCAN_LIMIT,
        offset: 0,
      },
    })
    const matching = result.orders.filter(
      needs === "fulfillment" ? needsFulfillment : needsPaymentReview
    )

    return {
      needs,
      total_matching: matching.length,
      orders: matching.slice(0, take).map(toOrderSummary),
      ...(result.count > result.orders.length
        ? {
            note: `Only the ${result.orders.length} most recent orders were checked.`,
          }
        : {}),
    }
  },
})

const getOrderDetails = defineTool({
  description:
    "One order in full: items with prices, totals, refunds, delivery method and area, fulfillment history, and payment and fulfillment status. Use the order number the owner sees, for example 1042 for #1042.",
  parameters: z.object({
    order_number: z.number().int().min(1),
  }),
  execute: async ({ order_number }, context) => {
    const { result: list } = await listMerchantOrdersWorkflow(
      context.container
    ).run({
      input: {
        ...scopeOf(context),
        display_id: order_number,
        limit: 1,
        offset: 0,
      },
    })
    const summary = list.orders[0]

    if (!summary) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `There is no order #${order_number} in this store`
      )
    }

    const { result } = await retrieveMerchantOrderWorkflow(
      context.container
    ).run({ input: { ...scopeOf(context), order_id: summary.id } })

    return toOrderDetails(summary, result as unknown as OrderDetailSource)
  },
})

// The customer workflow pages after filtering, so take one large page and
// sort it here.
const CUSTOMER_SCAN_LIMIT = 1000

const listCustomers = defineTool({
  description:
    "The store's customers with name, masked email, whether they have an account, number of orders, and first and last order dates. Sort by most_orders to find repeat buyers. Filter by a segment id from list_customer_segments. Phone numbers and full emails are never included.",
  parameters: z.object({
    query: z
      .string()
      .max(100)
      .optional()
      .describe("Words from the customer's name"),
    segment_id: z.string().min(1).optional(),
    account_type: z.enum(["registered", "guest"]).optional(),
    sort: z
      .enum(["recent", "most_orders"])
      .optional()
      .describe("recent: latest order first (default). most_orders: best buyers first."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe("How many customers to return. Default 10."),
  }),
  execute: async ({ query, segment_id, account_type, sort, limit }, context) => {
    const { result } = await listMerchantCustomersWorkflow(
      context.container
    ).run({
      input: {
        ...scopeOf(context),
        q: query || undefined,
        segment_id,
        account_type,
        limit: CUSTOMER_SCAN_LIMIT,
        offset: 0,
      },
    })

    return {
      total_customers: result.count,
      ...summarizeCustomers(result.customers, sort ?? "recent", limit ?? 10),
    }
  },
})

const listCustomerSegments = defineTool({
  description:
    "The merchant's customer segments (saved groups such as VIPs or wholesale buyers) with their ids, descriptions and number of customers.",
  parameters: z.object({
    query: z.string().max(100).optional().describe("Words from the segment name"),
  }),
  execute: async ({ query }, context) => {
    const { result } = await listMerchantCustomerSegmentsWorkflow(
      context.container
    ).run({
      input: { ...scopeOf(context), q: query || undefined, limit: 100, offset: 0 },
    })

    return {
      total_segments: result.count,
      segments: result.customer_segments.map(
        ({ id, name, description, customer_count }) => ({
          id,
          name,
          description,
          customer_count,
        })
      ),
    }
  },
})

const getCatalogStructure = defineTool({
  description:
    "How the catalog is organised: categories (with parent category, product count and whether shoppers can see it) and collections (with product count).",
  parameters: z.object({}),
  execute: async (_args, context) => {
    const [{ result: categories }, { result: collections }] = await Promise.all([
      listMerchantCategoriesWorkflow(context.container).run({
        input: scopeOf(context),
      }),
      listMerchantCollectionsWorkflow(context.container).run({
        input: scopeOf(context),
      }),
    ])
    const categoryNames = new Map(
      categories.product_categories.map(({ id, name }) => [id, name])
    )

    return {
      categories: categories.product_categories.map((category) => ({
        name: category.name,
        parent: category.parent_category_id
          ? categoryNames.get(category.parent_category_id) ?? null
          : null,
        product_count: category.product_count,
        visible_to_shoppers: category.is_active && !category.is_internal,
      })),
      collections: collections.collections.map(({ title, product_count }) => ({
        title,
        product_count,
      })),
    }
  },
})

const listDeliveryMethods = defineTool({
  description:
    "The delivery methods shoppers can choose at checkout: name, price, estimated delivery time, where orders ship from, countries served, and whether each is enabled or the default.",
  parameters: z.object({}),
  execute: async (_args, context) => {
    const { result } = await listMerchantDeliveryMethodsWorkflow(
      context.container
    ).run({ input: scopeOf(context) })

    return {
      delivery_methods: result.delivery_options.map((option) => ({
        name: option.name,
        description: option.description,
        estimated_delivery: option.estimated_delivery,
        enabled: option.is_enabled,
        is_default: option.is_default,
        price: option.price
          ? {
              amount: option.price.amount,
              currency_code: option.price.currency_code,
            }
          : null,
        ships_from: option.stock_location.name,
        countries: option.service_zone.country_codes,
      })),
    }
  },
})

type ActivityRecord = {
  action: string
  description: string
  created_at?: Date | string | null
}

type NotificationRecord = {
  title: string
  message: string
  severity: string
  read_at?: Date | string | null
  created_at?: Date | string | null
}

const getRecentActivity = defineTool({
  description:
    "What changed in the store recently, newest first: changes the team made (products, orders, settings) and store notifications. Use for questions like 'what happened this week'.",
  parameters: z.object({
    days: z
      .number()
      .int()
      .min(1)
      .max(30)
      .optional()
      .describe("How many days back to look. Default 7."),
  }),
  execute: async ({ days }, context) => {
    const period = days ?? 7
    const since = new Date(Date.now() - period * 24 * 60 * 60 * 1000)
    const { result } = await listMerchantActivityWorkflow(
      context.container
    ).run({
      input: { ...scopeOf(context), since: since.toISOString(), limit: 50 },
    })

    return {
      days: period,
      activities: (result.activities as ActivityRecord[]).map((activity) => ({
        at: isoDate(activity.created_at),
        action: activity.action,
        description: activity.description,
      })),
      notifications: (result.notifications as NotificationRecord[]).map(
        (notification) => ({
          at: isoDate(notification.created_at),
          title: notification.title,
          message: notification.message,
          severity: notification.severity,
          read: Boolean(notification.read_at),
        })
      ),
    }
  },
})

export const storeAssistantTools = {
  get_sales_summary: getSalesSummary,
  list_low_stock: listLowStock,
  get_product_performance: getProductPerformance,
  find_products: findProducts,
  get_product_details: getProductDetails,
  list_orders: listOrders,
  get_order_details: getOrderDetails,
  list_customers: listCustomers,
  list_customer_segments: listCustomerSegments,
  get_catalog_structure: getCatalogStructure,
  list_delivery_methods: listDeliveryMethods,
  get_recent_activity: getRecentActivity,
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
    return { error: errorMessage(error) }
  }
}

// Workflows can throw plain objects rather than Error instances.
const errorMessage = (error: unknown) => {
  const message =
    error instanceof Error
      ? error.message
      : (error as { message?: unknown } | null)?.message

  return typeof message === "string" && message ? message : "The tool failed"
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
