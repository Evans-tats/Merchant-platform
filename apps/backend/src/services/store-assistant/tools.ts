import type { MedusaContainer } from "@medusajs/framework/types"
import { MedusaError } from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"

import {
  listMerchantProductsWorkflow,
  retrieveMerchantProductWorkflow,
} from "../../workflows/merchant-catalog"
import { listMerchantCategoriesWorkflow } from "../../workflows/merchant-categories"
import {
  listMerchantCollectionsWorkflow,
  retrieveMerchantCollectionWorkflow,
} from "../../workflows/merchant-collections"
import { retrieveMerchantCustomerWorkflow } from "../../workflows/merchant-customer"
import {
  listMerchantCustomerSegmentsWorkflow,
  retrieveMerchantCustomerSegmentWorkflow,
} from "../../workflows/merchant-customer-segments"
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
import {
  MERCHANT_SEGMENT_DESCRIPTION_MAX_LENGTH,
  MERCHANT_SEGMENT_NAME_MAX_LENGTH,
  normalizeSegmentName,
} from "../merchant-customer-segments"
import {
  isPlacedOrder,
  needsFulfillment,
  needsPaymentReview,
} from "../merchant-home"
import type {
  MerchantMemberRole,
  ResolvedMerchantId,
} from "../tenant-resolution"
import {
  PRODUCT_DESCRIPTION_MAX_LENGTH,
  type NewStoreAssistantProposal,
} from "./proposals"

// The assistant's only way to see store data. Every tool runs a workflow that
// is scoped to the signed-in merchant, so the model can't read another
// merchant's data whatever it asks for. No tool changes anything: the read
// tools look things up, and the propose_ tools save a suggestion that the
// member approves or dismisses in the chat.
//
// Customer data goes to a third-party model, so tools send names and order
// history but mask emails and leave out phone numbers and street addresses.

export type StoreAssistantToolContext = {
  container: MedusaContainer
  // From the merchant route's tenancy check, never from the model.
  merchant_id: ResolvedMerchantId
  sales_channel_id: string
  role: MerchantMemberRole
  // Saves a suggestion and shows it in the chat as a card.
  propose: (proposal: NewStoreAssistantProposal) => Promise<{ id: string }>
}

type StoreAssistantTool<Schema extends z.ZodType> = {
  description: string
  parameters: Schema
  // Members who may use the tool. Leave out for everyone. A propose_ tool
  // must match the roles its merchant route accepts, so the member can
  // approve every card it makes.
  roles?: readonly MerchantMemberRole[]
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

type DeliveryAddress = {
  city?: string | null
  province?: string | null
  country_code?: string | null
}

// Where deliveries go, without the street address or phone number.
const deliveryArea = (address?: DeliveryAddress | null) =>
  [address?.city, address?.province, address?.country_code?.toUpperCase()]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(", ") || null

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
  shipping_address?: DeliveryAddress | null
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
      area: deliveryArea(order.shipping_address),
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

const twoDecimals = (value: number) => Math.round(value * 100) / 100

const percentOf = (part: number, whole: number) =>
  whole ? Math.round((part / whole) * 100) : 0

type CustomerOrderSource = {
  display_id?: number | null
  status: string
  currency_code?: string | null
  total?: number | null
  created_at?: Date | string | null
  items?: OrderItemSource[]
}

export type CustomerDetailSource = PersonName & {
  id: string
  email?: string | null
  company_name?: string | null
  has_account?: boolean | null
  created_at?: Date | string | null
  addresses?: DeliveryAddress[]
  orders?: CustomerOrderSource[]
  segments?: Array<{ id: string; name: string }>
}

// Spend counts placed orders only, like the home page's sales.
export const toCustomerDetails = (customer: CustomerDetailSource) => {
  const orders = [...(customer.orders ?? [])].sort((left, right) =>
    (isoDate(right.created_at) ?? "").localeCompare(
      isoDate(left.created_at) ?? ""
    )
  )
  const placed = orders.filter(isPlacedOrder)
  const spent = placed.reduce((sum, order) => sum + Number(order.total ?? 0), 0)
  const currencies = new Set(
    placed.map(({ currency_code }) => currency_code?.toLowerCase() ?? null)
  )
  const bought = new Map<string, number>()

  for (const order of placed) {
    for (const item of order.items ?? []) {
      const name = item.product_title || item.title || "Unknown product"

      bought.set(name, (bought.get(name) ?? 0) + Number(item.quantity ?? 0))
    }
  }

  return {
    customer_id: customer.id,
    name: fullName(customer) ?? customer.company_name ?? null,
    company: customer.company_name ?? null,
    email: maskEmail(customer.email),
    registered: customer.has_account === true,
    customer_since: isoDate(customer.created_at),
    segments: (customer.segments ?? []).map(({ id, name }) => ({ id, name })),
    delivery_areas: Array.from(
      new Set((customer.addresses ?? []).map(deliveryArea).filter(Boolean))
    ),
    order_count: orders.length,
    placed_order_count: placed.length,
    total_spent: spent,
    average_order_value: placed.length ? twoDecimals(spent / placed.length) : 0,
    currency_code: currencies.size === 1 ? Array.from(currencies)[0] : null,
    has_mixed_currencies: currencies.size > 1,
    first_order_at: isoDate(orders[orders.length - 1]?.created_at),
    last_order_at: isoDate(orders[0]?.created_at),
    top_products: Array.from(bought, ([name, quantity]) => ({ name, quantity }))
      .sort((left, right) => right.quantity - left.quantity)
      .slice(0, 5),
    recent_orders: orders.slice(0, 10).map((order) => ({
      order_number: order.display_id ?? null,
      placed_at: isoDate(order.created_at),
      status: order.status,
      total: Number(order.total ?? 0),
      items: (order.items ?? [])
        .slice(0, 5)
        .map((item) => `${Number(item.quantity ?? 0)} x ${itemName(item)}`),
    })),
  }
}

export const CUSTOMER_GROUPS = [
  "top_spenders",
  "repeat",
  "one_time",
  "new",
  "lapsed",
] as const

export type CustomerGroup = (typeof CUSTOMER_GROUPS)[number]

const DAY_MS = 24 * 60 * 60 * 1000

const daysSince = (iso: string | null, now: Date) =>
  iso ? Math.floor((now.getTime() - new Date(iso).getTime()) / DAY_MS) : null

type CustomerOrder = (
  left: MerchantCustomerListItem,
  right: MerchantCustomerListItem
) => number

const latestOrderFirst: CustomerOrder = (left, right) =>
  (right.last_order_at ?? "").localeCompare(left.last_order_at ?? "")

const mostSpentFirst: CustomerOrder = (left, right) =>
  right.total_spent - left.total_spent || latestOrderFirst(left, right)

// Each group's rule, how its customers are listed, and the definition the
// model repeats to the owner. Order counts are placed orders only.
const customerGroupRules = (
  days: { new: number; lapsed: number },
  now: Date
): Record<
  CustomerGroup,
  {
    definition: string
    matches: (customer: MerchantCustomerListItem) => boolean
    order: CustomerOrder
  }
> => ({
  top_spenders: {
    definition: "customers with at least 1 order, most spent first",
    matches: (customer) => customer.placed_order_count > 0,
    order: mostSpentFirst,
  },
  repeat: {
    definition: "2 or more orders",
    matches: (customer) => customer.placed_order_count >= 2,
    order: (left, right) =>
      right.placed_order_count - left.placed_order_count ||
      mostSpentFirst(left, right),
  },
  one_time: {
    definition: "exactly 1 order",
    matches: (customer) => customer.placed_order_count === 1,
    order: latestOrderFirst,
  },
  new: {
    definition: `first order in the last ${days.new} days`,
    matches: (customer) =>
      customer.placed_order_count > 0 &&
      (daysSince(customer.first_order_at, now) ?? Infinity) < days.new,
    order: (left, right) =>
      (right.first_order_at ?? "").localeCompare(left.first_order_at ?? ""),
  },
  // Regulars who stopped buying, most valuable first.
  lapsed: {
    definition: `2 or more orders, but none in the last ${days.lapsed} days`,
    matches: (customer) =>
      customer.placed_order_count >= 2 &&
      (daysSince(customer.last_order_at, now) ?? 0) >= days.lapsed,
    order: mostSpentFirst,
  },
})

// Counts per group plus revenue figures, and the customers of one group when
// asked. `days` sets the window of the group being listed, new or lapsed.
export const analyzeCustomers = (
  customers: MerchantCustomerListItem[],
  options: { group?: CustomerGroup; days?: number; limit: number; now?: Date }
) => {
  const now = options.now ?? new Date()
  const rules = customerGroupRules(
    {
      new: options.group === "new" ? options.days ?? 30 : 30,
      lapsed: options.group === "lapsed" ? options.days ?? 90 : 90,
    },
    now
  )
  const buyers = customers.filter(rules.top_spenders.matches)
  const revenue = buyers.reduce((sum, customer) => sum + customer.total_spent, 0)
  const placedOrders = buyers.reduce(
    (sum, customer) => sum + customer.placed_order_count,
    0
  )
  // A buyer without a currency paid in more than one.
  const currencies = new Set(buyers.map(({ currency_code }) => currency_code))
  const mixedCurrencies = currencies.size > 1 || currencies.has(null)
  const overview = {
    customers: customers.length,
    buyers: buyers.length,
    no_placed_orders: customers.length - buyers.length,
    revenue,
    placed_orders: placedOrders,
    average_order_value: placedOrders ? twoDecimals(revenue / placedOrders) : 0,
    average_spent_per_buyer: buyers.length
      ? twoDecimals(revenue / buyers.length)
      : 0,
    repeat_buyer_percent: percentOf(
      buyers.filter(rules.repeat.matches).length,
      buyers.length
    ),
    currency_code: mixedCurrencies ? null : Array.from(currencies)[0] ?? null,
    has_mixed_currencies: mixedCurrencies,
    groups: (["repeat", "one_time", "new", "lapsed"] as const).map((group) => ({
      group,
      definition: rules[group].definition,
      customers: customers.filter(rules[group].matches).length,
    })),
  }

  const listGroup = (group: CustomerGroup) => {
    const rule = rules[group]
    const members = customers.filter(rule.matches).sort(rule.order)

    return {
      group,
      definition: rule.definition,
      total: members.length,
      customers: members.slice(0, options.limit).map((customer) => ({
        customer_id: customer.customer_id,
        name: fullName(customer) ?? customer.company_name,
        email: maskEmail(customer.email),
        registered: customer.has_account,
        placed_orders: customer.placed_order_count,
        total_spent: customer.total_spent,
        first_order_at: customer.first_order_at,
        last_order_at: customer.last_order_at,
        days_since_last_order: daysSince(customer.last_order_at, now),
      })),
    }
  }

  return {
    ...overview,
    ...(options.group ? { group: listGroup(options.group) } : {}),
  }
}

const getSalesSummary = defineTool({
  description:
    "Sales for a period compared with the period before it: revenue, orders, average order value, unique customers, sales by day, the top 5 products by revenue, and counts of things needing attention (orders to fulfil, payments to confirm, low-stock variants, unpublished products). Use for questions like 'how is my business doing'.",
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

type ProductSource = {
  id: string
  title: string
  description?: string | null
  status: string
  collection?: { id: string; title: string } | null
  variants?: Array<{
    title: string
    prices?: Array<{ amount: number; currency_code: string }>
  }>
}

// One of the merchant's own products. Another merchant's id reads as not
// found.
const retrieveProduct = async (
  productId: string,
  context: StoreAssistantToolContext
) => {
  const { result } = await retrieveMerchantProductWorkflow(
    context.container
  ).run({ input: { ...scopeOf(context), product_id: productId } })

  return result as unknown as ProductSource
}

const getProductDetails = defineTool({
  description:
    "One product's title, description, options, variants and current prices. Use before drafting marketing copy about it.",
  parameters: z.object({
    product_id: z.string().min(1),
  }),
  execute: async ({ product_id }, context) => {
    const product = (await retrieveProduct(product_id, context)) as Record<
      string,
      any
    >

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
    "The store's orders, newest first: order number, date, customer, items, total, payment status and fulfillment status. Set needs to 'fulfillment' for orders still to be packed or shipped, or 'payment_review' for orders whose payment the owner hasn't confirmed yet (the home page's 'Payments to confirm'). These match the counts on the home page.",
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

// The order with this number among the merchant's own orders.
const findOrderByNumber = async (
  orderNumber: number,
  context: StoreAssistantToolContext
) => {
  const { result } = await listMerchantOrdersWorkflow(context.container).run({
    input: {
      ...scopeOf(context),
      display_id: orderNumber,
      limit: 1,
      offset: 0,
    },
  })
  const order = result.orders[0]

  if (!order) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `There is no order #${orderNumber} in this store`
    )
  }

  return order
}

const getOrderDetails = defineTool({
  description:
    "One order in full: items with prices, totals, refunds, delivery method and area, fulfillment history, and payment and fulfillment status. Use the order number the owner sees, for example 1042 for #1042.",
  parameters: z.object({
    order_number: z.number().int().min(1),
  }),
  execute: async ({ order_number }, context) => {
    const summary = await findOrderByNumber(order_number, context)
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

// The customer and segment list workflows build the whole list before they
// page, so taking every row costs no more than one page. Only counts and a
// few rows go to the model.
const EVERY_ROW = { limit: Number.MAX_SAFE_INTEGER, offset: 0 }

const listEveryCustomer = async (context: StoreAssistantToolContext) => {
  const { result } = await listMerchantCustomersWorkflow(
    context.container
  ).run({ input: { ...scopeOf(context), ...EVERY_ROW } })

  return result.customers
}

// One of the merchant's own segments with its members. Another merchant's id
// reads as not found.
const retrieveSegment = async (
  segmentId: string,
  context: StoreAssistantToolContext
) => {
  const { result } = await retrieveMerchantCustomerSegmentWorkflow(
    context.container
  ).run({ input: { ...scopeOf(context), segment_id: segmentId } })

  return result
}

const getCustomerDetails = defineTool({
  description:
    "One customer in full: their orders with items and totals, what they've spent, the products they buy most, the segments they're in, and the areas they get deliveries in. Get the customer_id from list_customers or analyze_customers. Phone numbers, street addresses and full emails are never included.",
  parameters: z.object({
    customer_id: z.string().min(1),
  }),
  execute: async ({ customer_id }, context) => {
    const { result } = await retrieveMerchantCustomerWorkflow(
      context.container
    ).run({ input: { merchant_id: context.merchant_id, customer_id } })

    return toCustomerDetails(result as unknown as CustomerDetailSource)
  },
})

const analyzeCustomersTool = defineTool({
  description:
    "Groups the store's customers by how much, how often and how recently they buy. Use it for questions like 'who are my best customers', 'who stopped buying' or 'how many come back'. Returns revenue from customers, average order value, the share of buyers who come back, and how many customers are in each group. Set group to list one group's customers: top_spenders (most spent first), repeat (2 or more orders), one_time (exactly 1 order), new (first order recently) or lapsed (2 or more orders, none recently). Set segment_id to look at one segment and compare it with the whole store. Canceled and draft orders don't count.",
  parameters: z.object({
    group: z
      .enum(CUSTOMER_GROUPS)
      .optional()
      .describe("List the customers in this group. Leave out for counts only."),
    days: z
      .number()
      .int()
      .min(1)
      .max(365)
      .optional()
      .describe(
        "For new: first order within this many days (default 30). For lapsed: no order for this many days (default 90)."
      ),
    segment_id: z
      .string()
      .min(1)
      .optional()
      .describe("Only customers in this segment, from list_customer_segments"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe("How many customers of the group to return. Default 10."),
  }),
  execute: async ({ group, days, segment_id, limit }, context) => {
    const [customers, segment] = await Promise.all([
      listEveryCustomer(context),
      segment_id ? retrieveSegment(segment_id, context) : undefined,
    ])
    const options = { group, days, limit: limit ?? 10 }

    if (!segment) {
      return analyzeCustomers(customers, options)
    }

    const members = new Set(segment.customers.map(({ id }) => id))
    const analysis = analyzeCustomers(
      customers.filter(
        ({ customer_id }) => customer_id !== null && members.has(customer_id)
      ),
      options
    )
    const store = analyzeCustomers(customers, { limit: 0 })

    return {
      segment: {
        id: segment.id,
        name: segment.name,
        share_of_store_revenue_percent: percentOf(
          analysis.revenue,
          store.revenue
        ),
        share_of_store_buyers_percent: percentOf(analysis.buyers, store.buyers),
        store_average_order_value: store.average_order_value,
      },
      ...analysis,
    }
  },
})

const getCatalogStructure = defineTool({
  description:
    "How the catalog is organised: categories (with parent category, product count and whether shoppers can see it) and collections (with id and product count).",
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
      collections: collections.collections.map(
        ({ id, title, product_count }) => ({ id, title, product_count })
      ),
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

// What the model hears back after a suggestion is saved.
const waitingForOwner = (proposalId: string) => ({
  proposal_id: proposalId,
  status: "waiting_for_owner",
  note: "The owner sees this as a card in the chat. Nothing has changed yet.",
})

const proposeOrderNote = defineTool({
  description:
    "Suggest an internal note on an order, for the shop's team. The owner sees it as a card and approves, edits or dismisses it. Nothing is saved until they approve. Use the order number the owner sees, for example 1042 for #1042.",
  parameters: z.object({
    order_number: z.number().int().min(1),
    note: z
      .string()
      .trim()
      .min(1)
      .max(2000)
      .describe("The note, written for the shop's team"),
    summary: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .describe("One short sentence telling the owner why you suggest it"),
  }),
  execute: async ({ order_number, note, summary }, context) => {
    const order = await findOrderByNumber(order_number, context)
    const { id } = await context.propose({
      action: "add_order_note",
      args: { order_id: order.id, note },
      preview: { order_number: order.display_id ?? order_number },
      summary,
    })

    return waitingForOwner(id)
  },
})

// The product and collection routes only let owners and admins change the
// catalog, so only they are offered these suggestions.
const catalogManagers = ["owner", "admin"] as const

const proposalSummary = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .describe("One short sentence telling the owner why you suggest it")

const proposePublishProduct = defineTool({
  description:
    "Suggest publishing a product that isn't published yet, so shoppers can find and buy it. The owner sees it as a card and approves or dismisses it. Get the product id from find_products.",
  roles: catalogManagers,
  parameters: z.object({
    product_id: z.string().min(1),
    summary: proposalSummary,
  }),
  execute: async ({ product_id, summary }, context) => {
    const product = await retrieveProduct(product_id, context)

    if (product.status === "published") {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `${product.title} is already published`
      )
    }

    // Publishing fails without prices, and the assistant never suggests
    // prices, so the owner is told to add them instead of getting a card
    // that can't work.
    const unpriced = (product.variants ?? [])
      .filter(({ prices }) => !prices?.length)
      .map(({ title }) => title)

    if (unpriced.length) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `${product.title} can't be published yet: ${unpriced.join(", ")} has no price. The owner has to add prices first.`
      )
    }

    const { id } = await context.propose({
      action: "publish_product",
      args: { product_id: product.id },
      preview: { title: product.title, status: product.status },
      summary,
    })

    return waitingForOwner(id)
  },
})

const proposeProductDescription = defineTool({
  description:
    "Suggest a new description for a product. Read it with get_product_details first and use only facts from its details. The owner sees the new and current text side by side and approves, edits or dismisses it.",
  roles: catalogManagers,
  parameters: z.object({
    product_id: z.string().min(1),
    description: z
      .string()
      .trim()
      .min(1)
      .max(PRODUCT_DESCRIPTION_MAX_LENGTH)
      .describe(
        "The whole new description in plain text, with no prices or discounts"
      ),
    summary: proposalSummary,
  }),
  execute: async ({ product_id, description, summary }, context) => {
    const product = await retrieveProduct(product_id, context)

    if (product.description?.trim() === description) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "That is already the product's description"
      )
    }

    const { id } = await context.propose({
      action: "update_product_description",
      args: { product_id: product.id, description },
      preview: {
        title: product.title,
        current_description: product.description?.trim() || null,
      },
      summary,
    })

    return waitingForOwner(id)
  },
})

const proposeCollectionProducts = defineTool({
  description:
    "Suggest adding products to one of the merchant's collections. A product belongs to one collection at a time, so adding it moves it out of its current collection; the card shows this. Get the collection id from get_catalog_structure and product ids from find_products.",
  roles: catalogManagers,
  parameters: z.object({
    collection_id: z.string().min(1),
    product_ids: z.array(z.string().min(1)).min(1).max(20),
    summary: proposalSummary,
  }),
  execute: async ({ collection_id, product_ids, summary }, context) => {
    const { result: collection } = await retrieveMerchantCollectionWorkflow(
      context.container
    ).run({ input: { ...scopeOf(context), collection_id } })
    const members = new Set(collection.products.map(({ id }) => id))
    const products = await Promise.all(
      Array.from(new Set(product_ids)).map((productId) =>
        retrieveProduct(productId, context)
      )
    )
    const toAdd = products.filter(({ id }) => !members.has(id))

    if (!toAdd.length) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `These products are already in ${collection.title}`
      )
    }

    const { id } = await context.propose({
      action: "add_collection_products",
      args: {
        collection_id: collection.id,
        product_ids: toAdd.map((product) => product.id),
      },
      preview: {
        collection_title: collection.title,
        products: toAdd.map((product) => ({
          id: product.id,
          title: product.title,
          current_collection: product.collection?.title ?? null,
        })),
      },
      summary,
    })

    return {
      ...waitingForOwner(id),
      already_in_collection: products
        .filter((product) => members.has(product.id))
        .map(({ title }) => title),
      would_leave_their_current_collection: toAdd
        .filter(({ collection }) => collection)
        .map(({ title, collection }) => `${title} (now in ${collection!.title})`),
    }
  },
})

// The customer and segment routes only let owners and admins change them.
const customerManagers = ["owner", "admin"] as const

// The merchant's customers that can be put in a segment, by id. A guest order
// without a customer record has no id, so it can't.
const segmentableCustomers = async (context: StoreAssistantToolContext) =>
  new Map(
    (await listEveryCustomer(context)).flatMap((customer) =>
      customer.customer_id ? [[customer.customer_id, customer] as const] : []
    )
  )

const requireCustomers = (
  ids: string[],
  customers: Map<string, MerchantCustomerListItem>
) => {
  const unknown = ids.filter((id) => !customers.has(id))

  if (unknown.length) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Not customers of this store: ${unknown.join(", ")}. Use customer ids from list_customers or analyze_customers.`
    )
  }

  return ids.map((id) => customers.get(id)!)
}

// How a customer appears on a card: enough to recognise them, masked like
// everything else the assistant handles.
const previewCustomer = (customer: MerchantCustomerListItem) => ({
  id: customer.customer_id!,
  name:
    fullName(customer) ??
    customer.company_name ??
    maskEmail(customer.email) ??
    "Customer",
  email: maskEmail(customer.email),
})

const proposeSegmentCustomers = defineTool({
  description:
    "Suggest adding customers to one of the merchant's segments, removing them from it, or both. The owner sees the customers on a card and can untick any before approving. Get the segment id from list_customer_segments and customer ids from list_customers or analyze_customers. For a new segment, use propose_create_segment.",
  roles: customerManagers,
  parameters: z.object({
    segment_id: z.string().min(1),
    add: z
      .array(z.string().min(1))
      .max(50)
      .optional()
      .describe("Ids of customers to add"),
    remove: z
      .array(z.string().min(1))
      .max(50)
      .optional()
      .describe("Ids of customers to remove"),
    summary: proposalSummary,
  }),
  execute: async ({ segment_id, add, remove, summary }, context) => {
    const adding = Array.from(new Set(add ?? []))
    const removing = Array.from(new Set(remove ?? []))

    if (!adding.length && !removing.length) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Give the ids of customers to add or remove"
      )
    }

    const [segment, customers] = await Promise.all([
      retrieveSegment(segment_id, context),
      segmentableCustomers(context),
    ])
    const nameOf = (id: string) => previewCustomer(customers.get(id)!).name

    requireCustomers([...adding, ...removing], customers)

    const both = adding.filter((id) => removing.includes(id))

    if (both.length) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `A customer can't be added and removed at once: ${both.map(nameOf).join(", ")}`
      )
    }

    const members = new Set(segment.customers.map(({ id }) => id))
    const toAdd = adding.filter((id) => !members.has(id))
    const toRemove = removing.filter((id) => members.has(id))

    if (!toAdd.length && !toRemove.length) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `Nothing would change in ${segment.name}: the customers to add are already in it and the customers to remove aren't`
      )
    }

    const { id } = await context.propose({
      action: "update_segment_customers",
      args: { segment_id: segment.id, add: toAdd, remove: toRemove },
      preview: {
        segment_name: segment.name,
        customers: [...toAdd, ...toRemove].map((customerId) =>
          previewCustomer(customers.get(customerId)!)
        ),
      },
      summary,
    })

    return {
      ...waitingForOwner(id),
      already_in_segment: adding.filter((id) => members.has(id)).map(nameOf),
      not_in_segment: removing.filter((id) => !members.has(id)).map(nameOf),
    }
  },
})

const proposeCreateSegment = defineTool({
  description:
    "Suggest a new customer segment, with customers in it if you like, for example the lapsed regulars from analyze_customers. The owner can rename it, change the description and untick customers before approving. Check list_customer_segments first: to add customers to a segment that exists, use propose_segment_customers. A segment only groups customers; it doesn't give them prices or discounts.",
  roles: customerManagers,
  parameters: z.object({
    name: z
      .string()
      .trim()
      .min(1)
      .max(MERCHANT_SEGMENT_NAME_MAX_LENGTH)
      .describe("A short name, like Lapsed regulars"),
    description: z
      .string()
      .trim()
      .max(MERCHANT_SEGMENT_DESCRIPTION_MAX_LENGTH)
      .optional()
      .describe("One sentence on who belongs in it, for the shop's team"),
    customer_ids: z
      .array(z.string().min(1))
      .max(50)
      .optional()
      .describe("Ids of customers to put in it"),
    summary: proposalSummary,
  }),
  execute: async ({ name, description, customer_ids, summary }, context) => {
    const [{ result: segments }, customers] = await Promise.all([
      listMerchantCustomerSegmentsWorkflow(context.container).run({
        input: { ...scopeOf(context), ...EVERY_ROW },
      }),
      segmentableCustomers(context),
    ])
    const segmentName = normalizeSegmentName(name)
    const existing = segments.customer_segments.find(
      (segment) =>
        normalizeSegmentName(segment.name).toLowerCase() ===
        segmentName.toLowerCase()
    )

    if (existing) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `There's already a segment called ${existing.name} (id ${existing.id}). To add customers to it, use propose_segment_customers.`
      )
    }

    const ids = Array.from(new Set(customer_ids ?? []))
    const members = requireCustomers(ids, customers)
    const { id } = await context.propose({
      action: "create_segment",
      args: {
        name: segmentName,
        description: description || null,
        customer_ids: ids,
      },
      preview: { customers: members.map(previewCustomer) },
      summary,
    })

    return waitingForOwner(id)
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
  get_customer_details: getCustomerDetails,
  analyze_customers: analyzeCustomersTool,
  get_catalog_structure: getCatalogStructure,
  list_delivery_methods: listDeliveryMethods,
  get_recent_activity: getRecentActivity,
  propose_order_note: proposeOrderNote,
  propose_publish_product: proposePublishProduct,
  propose_product_description: proposeProductDescription,
  propose_collection_products: proposeCollectionProducts,
  propose_segment_customers: proposeSegmentCustomers,
  propose_create_segment: proposeCreateSegment,
}

export type StoreAssistantToolName = keyof typeof storeAssistantTools

export const isStoreAssistantTool = (
  name: string
): name is StoreAssistantToolName => name in storeAssistantTools

const toolFor = (name: string, role?: MerchantMemberRole) => {
  if (!isStoreAssistantTool(name)) {
    return null
  }

  const tool = storeAssistantTools[name] as StoreAssistantTool<z.ZodType>

  return !role || !tool.roles || tool.roles.includes(role) ? tool : null
}

// Validates the model's arguments before running a tool. Errors come back
// as a result the model can read and recover from, not as a failed request.
export const runStoreAssistantTool = async (
  name: string,
  args: unknown,
  context: StoreAssistantToolContext
): Promise<Record<string, unknown>> => {
  const tool = toolFor(name, context.role)

  if (!tool) {
    return { error: `Unknown tool ${name}` }
  }

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

// The tools offered to the model: all of them, or only the ones this member
// may use.
export const storeAssistantFunctionDeclarations = (role?: MerchantMemberRole) =>
  Object.keys(storeAssistantTools).flatMap((name) => {
    const tool = toolFor(name, role)

    if (!tool) {
      return []
    }

    const { $schema: _schemaVersion, ...parametersJsonSchema } =
      z.toJSONSchema(tool.parameters)

    return [{ name, description: tool.description, parametersJsonSchema }]
  })
