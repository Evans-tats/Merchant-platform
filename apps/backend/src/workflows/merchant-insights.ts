import {
  ContainerRegistrationKeys,
  MedusaError,
  OrderStatus,
} from "@medusajs/framework/utils"
import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import {
  getOrderDetailWorkflow,
  getOrdersListWorkflow,
  useQueryGraphStep,
} from "@medusajs/medusa/core-flows"

import { MERCHANT_MODULE } from "../modules/merchant"
import MerchantModuleService from "../modules/merchant/service"
import {
  buildMerchantHome,
  NOT_PLACED_ORDER_STATUSES,
  resolveMerchantHomePeriod,
  type MerchantHomeOrderSource,
  type MerchantHomeRange,
  type MerchantHomeStoreSource,
} from "../services/merchant-home"
import {
  assertMerchantOwns,
  type ResolvedMerchantId,
} from "../services/tenant-resolution"
import {
  type MerchantScopeInput,
  validateMerchantScopeStep,
} from "./steps/validate-merchant-commerce"

export const merchantOrderDetailFields = [
  "id",
  "display_id",
  "status",
  "no_notification",
  "email",
  "currency_code",
  "customer_id",
  "region_id",
  "metadata",
  "summary",
  "total",
  "subtotal",
  "tax_total",
  "discount_total",
  "shipping_total",
  "created_at",
  "updated_at",
  "items.*",
  "items.detail.*",
  "items.variant.id",
  "items.variant.title",
  "items.variant.sku",
  "items.variant.product.id",
  "items.variant.product.title",
  "items.variant.product.thumbnail",
  "shipping_address.*",
  "billing_address.*",
  "shipping_methods.*",
  "payment_collections.*",
  "payment_collections.payments.*",
  "payment_collections.payments.refunds.*",
  "payment_collections.payments.captures.*",
  "fulfillments.*",
  "fulfillments.items.*",
  "fulfillments.labels.*",
  "customer.id",
  "customer.email",
  "customer.first_name",
  "customer.last_name",
  "customer.phone",
  "customer.company_name",
  "customer.has_account",
]

export const merchantOrderListFields = [
  "id",
  "display_id",
  "status",
  "email",
  "customer_id",
  "currency_code",
  "total",
  "created_at",
  "customer.first_name",
  "customer.last_name",
  "customer.email",
  "items.title",
  "items.product_title",
  "items.variant_title",
  "items.quantity",
  "fulfillments.id",
  "fulfillments.shipped_at",
  "fulfillments.delivered_at",
  "fulfillments.canceled_at",
]

export type MerchantOrderListItem = {
  id: string
  display_id?: number | null
  status: string
  fulfillment_status?: string | null
  payment_status?: string | null
  email?: string | null
  customer_id?: string | null
  currency_code?: string | null
  total?: number | null
  created_at?: Date | string | null
  customer?: {
    first_name?: string | null
    last_name?: string | null
    email?: string | null
  } | null
  items?: Array<{
    title?: string | null
    product_title?: string | null
    variant_title?: string | null
    quantity?: number | null
  }>
  fulfillments?: Array<{
    id: string
    shipped_at?: Date | string | null
    delivered_at?: Date | string | null
    canceled_at?: Date | string | null
  }>
}

export type ListMerchantOrdersInput = MerchantScopeInput & {
  display_id?: number
  // Leaves out canceled and draft orders.
  placed_only?: boolean
  // Leave both out for every order.
  limit?: number
  offset?: number
}

type MerchantInventoryGraph = {
  stock_locations?: Array<Record<string, unknown> & { id: string }>
  products?: Array<{
    id: string
    title: string
    variants?: Array<{
      id: string
      title: string
      sku?: string | null
      inventory?: Array<{
        id: string
        sku?: string | null
        title?: string | null
        location_levels?: Array<Record<string, unknown>>
      }>
    }>
  }>
}

type MerchantReportGraph = {
  orders?: Array<{
    id: string
    status: string
    total?: number
    currency_code?: string
    customer_id?: string | null
    email?: string | null
    created_at?: Date | string
    items?: Array<{
      product_id?: string | null
      product_title?: string | null
      title?: string | null
      quantity?: number
      total?: number
    }>
  }>
  products?: Array<{ id: string; title: string; status: string }>
  customer_profiles?: Array<{ id: string; customer_id: string }>
}

type MerchantHomeStoreGraph = MerchantHomeStoreSource & {
  orders?: Array<{ id: string }>
}

export type RecordMerchantActivityInput = MerchantScopeInput & {
  actor_id?: string | null
  action: string
  resource_type: string
  resource_id?: string | null
  description: string
  metadata?: Record<string, unknown>
  notification?: {
    type: string
    severity?: "info" | "warning" | "critical"
    title: string
    message: string
  }
}

const assertMerchantOwnsOrderStep = createStep(
  "assert-merchant-owns-order",
  async (
    input: { merchant_id: ResolvedMerchantId; order_id: string },
    { container },
  ) => {
    await assertMerchantOwns(
      container,
      "order",
      input.order_id,
      input.merchant_id,
    )

    return new StepResponse(input.order_id)
  },
)

const listMerchantInventoryStep = createStep(
  "list-merchant-inventory",
  async (input: { merchant_id: ResolvedMerchantId }, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "merchant",
      fields: [
        "stock_locations.id",
        "stock_locations.name",
        "products.id",
        "products.title",
        "products.variants.id",
        "products.variants.title",
        "products.variants.sku",
        "products.variants.inventory.id",
        "products.variants.inventory.title",
        "products.variants.inventory.sku",
        "products.variants.inventory.location_levels.*",
      ],
      filters: { id: input.merchant_id },
    })
    const merchant = (data as unknown as MerchantInventoryGraph[])[0]
    const locations = merchant?.stock_locations ?? []
    const ownedLocationIds = new Set(locations.map(({ id }) => id))
    const inventoryItems = (merchant?.products ?? []).flatMap((product) => {
      return (product.variants ?? []).flatMap((variant) => {
        return (variant.inventory ?? []).map((inventoryItem) => ({
          id: inventoryItem.id,
          title: inventoryItem.title || `${product.title} - ${variant.title}`,
          sku: inventoryItem.sku || variant.sku || null,
          product: { id: product.id, title: product.title },
          variant: {
            id: variant.id,
            title: variant.title,
            sku: variant.sku ?? null,
          },
          location_levels: (inventoryItem.location_levels ?? []).filter(
            (level) =>
              typeof level.location_id === "string" &&
              ownedLocationIds.has(level.location_id),
          ),
        }))
      })
    })
    const uniqueItems = Array.from(
      new Map(inventoryItems.map((item) => [item.id, item])).values(),
    )

    return new StepResponse({
      stock_locations: locations,
      inventory_items: uniqueItems,
    })
  },
)

const retrieveMerchantReportsStep = createStep(
  "retrieve-merchant-reports",
  async (input: { merchant_id: ResolvedMerchantId }, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "merchant",
      fields: [
        "orders.id",
        "orders.status",
        "orders.total",
        "orders.currency_code",
        "orders.customer_id",
        "orders.email",
        "orders.created_at",
        "orders.items.product_id",
        "orders.items.product_title",
        "orders.items.title",
        "orders.items.quantity",
        "orders.items.total",
        "products.id",
        "products.title",
        "products.status",
        "customer_profiles.id",
        "customer_profiles.customer_id",
      ],
      filters: { id: input.merchant_id },
    })
    const merchant = (data as unknown as MerchantReportGraph[])[0]
    const orders = merchant?.orders ?? []
    const activeOrders = orders.filter(
      ({ status }) => !["canceled", "cancelled", "draft"].includes(status),
    )
    const customerKeys = new Set(
      (merchant?.customer_profiles ?? []).map(
        ({ customer_id }) => `customer:${customer_id}`,
      ),
    )

    for (const order of orders) {
      if (order.customer_id) {
        customerKeys.add(`customer:${order.customer_id}`)
      } else if (order.email?.trim()) {
        customerKeys.add(`email:${order.email.trim().toLowerCase()}`)
      } else {
        customerKeys.add(`order:${order.id}`)
      }
    }
    const revenue = activeOrders.reduce(
      (sum, order) => sum + Number(order.total ?? 0),
      0,
    )
    const productTotals = new Map<
      string,
      { product_id: string; title: string; quantity: number; revenue: number }
    >()

    for (const order of activeOrders) {
      for (const item of order.items ?? []) {
        const productId = item.product_id ?? "unassigned"
        const current = productTotals.get(productId) ?? {
          product_id: productId,
          title: item.product_title || item.title || "Unknown product",
          quantity: 0,
          revenue: 0,
        }
        current.quantity += Number(item.quantity ?? 0)
        current.revenue += Number(item.total ?? 0)
        productTotals.set(productId, current)
      }
    }

    return new StepResponse({
      currency_code: orders[0]?.currency_code ?? "kes",
      metrics: {
        revenue,
        order_count: orders.length,
        active_order_count: activeOrders.length,
        canceled_order_count: orders.length - activeOrders.length,
        average_order_value: activeOrders.length
          ? revenue / activeOrders.length
          : 0,
        product_count: merchant?.products?.length ?? 0,
        customer_count: customerKeys.size,
      },
      orders_by_day: buildOrdersByDay(activeOrders),
      product_performance: Array.from(productTotals.values()).sort(
        (left, right) => right.revenue - left.revenue,
      ),
    })
  },
)

const merchantHomeStoreFields = [
  "id",
  "name",
  "slug",
  "status",
  "domains.hostname",
  "domains.status",
  "domains.is_primary",
  "payment_configs.provider",
  "payment_configs.mode",
  "payment_configs.status",
  "products.id",
  "products.title",
  "products.status",
  "products.thumbnail",
  "products.variants.id",
  "products.variants.manage_inventory",
  "products.variants.inventory.location_levels.available_quantity",
  "products.variants.inventory.location_levels.stocked_quantity",
  "products.variants.inventory.location_levels.reserved_quantity",
  "stock_locations.id",
  "orders.id",
]

const buildMerchantHomeDataStep = createStep(
  "build-merchant-home-data",
  async (input: {
    merchant: MerchantHomeStoreGraph
    range: MerchantHomeRange
    orders: unknown
  }) => {
    const orderResult = input.orders as
      MerchantHomeOrderSource[] | { rows: MerchantHomeOrderSource[] }
    const orders = Array.isArray(orderResult) ? orderResult : orderResult.rows
    const period = resolveMerchantHomePeriod(input.range)
    const home = buildMerchantHome({
      merchant: input.merchant,
      period,
      period_orders: orders,
      attention_orders: orders,
      recent_orders: orders.slice(0, 5),
    })

    return new StepResponse(home)
  },
)

const listMerchantActivityStep = createStep(
  "list-merchant-activity",
  async (
    input: { merchant_id: ResolvedMerchantId; since?: string; limit?: number },
    { container },
  ) => {
    const merchantService =
      container.resolve<MerchantModuleService>(MERCHANT_MODULE)
    const filters = {
      merchant_id: input.merchant_id,
      ...(input.since ? { created_at: { $gte: new Date(input.since) } } : {}),
    }
    const config = {
      take: input.limit ?? 200,
      order: { created_at: "DESC" as const },
    }
    const [activities, notifications] = await Promise.all([
      merchantService.listMerchantActivities(filters, config),
      merchantService.listMerchantNotifications(filters, config),
    ])

    return new StepResponse({ activities, notifications })
  },
)

const recordMerchantActivityStep = createStep(
  "record-merchant-activity",
  async (input: RecordMerchantActivityInput, { container }) => {
    const merchantService =
      container.resolve<MerchantModuleService>(MERCHANT_MODULE)
    const activity = await merchantService.createMerchantActivities({
      merchant_id: input.merchant_id,
      actor_id: input.actor_id ?? null,
      action: input.action,
      resource_type: input.resource_type,
      resource_id: input.resource_id ?? null,
      description: input.description,
      metadata: input.metadata ?? {},
    })
    const notification = input.notification
      ? await merchantService.createMerchantNotifications({
          merchant_id: input.merchant_id,
          type: input.notification.type,
          severity: input.notification.severity ?? "info",
          title: input.notification.title,
          message: input.notification.message,
          resource_type: input.resource_type,
          resource_id: input.resource_id ?? null,
          metadata: input.metadata ?? {},
        })
      : null

    return new StepResponse({ activity, notification })
  },
)

const markMerchantNotificationReadStep = createStep(
  "mark-merchant-notification-read",
  async (
    input: { merchant_id: ResolvedMerchantId; notification_id: string },
    { container },
  ) => {
    const merchantService =
      container.resolve<MerchantModuleService>(MERCHANT_MODULE)
    const [notification] = await merchantService.listMerchantNotifications({
      id: input.notification_id,
      merchant_id: input.merchant_id,
    })

    if (!notification) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        "Merchant notification not found",
      )
    }

    const updated = await merchantService.updateMerchantNotifications({
      id: notification.id,
      read_at: new Date(),
    })

    return new StepResponse(updated)
  },
)

function buildOrdersByDay(orders: MerchantReportGraph["orders"] = []) {
  const totals = new Map<
    string,
    { date: string; orders: number; revenue: number }
  >()

  for (const order of orders) {
    const date = new Date(order.created_at ?? 0).toISOString().slice(0, 10)
    const current = totals.get(date) ?? { date, orders: 0, revenue: 0 }
    current.orders += 1
    current.revenue += Number(order.total ?? 0)
    totals.set(date, current)
  }

  return Array.from(totals.values()).sort((left, right) =>
    left.date.localeCompare(right.date),
  )
}

export const retrieveMerchantOrderWorkflow = createWorkflow(
  "retrieve-merchant-order",
  function (input: MerchantScopeInput & { order_id: string }) {
    const scope = validateMerchantScopeStep(input)
    const orderId = assertMerchantOwnsOrderStep({
      merchant_id: scope.merchant_id,
      order_id: input.order_id,
    })
    const order = getOrderDetailWorkflow.runAsStep({
      input: {
        order_id: orderId,
        fields: merchantOrderDetailFields,
      },
    })

    return new WorkflowResponse(order)
  },
)

// Only the merchant's orders, newest first, paged in the database. Payment and
// fulfillment status come from Medusa's order list workflow.
export const listMerchantOrdersWorkflow = createWorkflow(
  "list-merchant-orders",
  function (input: ListMerchantOrdersInput) {
    const scope = validateMerchantScopeStep(input)
    const { data: merchants } = useQueryGraphStep({
      entity: "merchant",
      fields: ["orders.id"],
      filters: { id: scope.merchant_id },
    })
    const variables = transform({ input, merchants }, ({ input, merchants }) => {
      const merchant = merchants[0] as { orders?: Array<{ id: string }> }
      const orderIds = (merchant?.orders ?? []).map(({ id }) => id)

      return {
        filters: {
          // An empty id filter must match no orders, never every order.
          id: orderIds.length ? orderIds : ["order_none"],
          ...(input.display_id === undefined
            ? {}
            : { display_id: input.display_id }),
          // Only Medusa's own status values: the column is a Postgres enum and
          // rejects other spellings such as "cancelled".
          ...(input.placed_only
            ? {
                status: {
                  $nin: NOT_PLACED_ORDER_STATUSES.filter((status) =>
                    Object.values<string>(OrderStatus).includes(status)
                  ),
                },
              }
            : {}),
        },
        ...(input.limit === undefined
          ? {}
          : { skip: input.offset ?? 0, take: input.limit }),
        order: { created_at: "DESC" },
      }
    })
    const orders = getOrdersListWorkflow.runAsStep({
      input: { fields: merchantOrderListFields, variables },
    })
    const result = transform({ input, orders }, ({ input, orders }) => {
      const page = orders as unknown as
        | MerchantOrderListItem[]
        | { rows: MerchantOrderListItem[]; metadata?: { count?: number } }
      const rows = Array.isArray(page) ? page : page.rows

      return {
        orders: rows,
        count: Array.isArray(page)
          ? rows.length
          : (page.metadata?.count ?? rows.length),
        limit: input.limit ?? null,
        offset: input.offset ?? 0,
      }
    })

    return new WorkflowResponse(result)
  },
)

export const listMerchantInventoryWorkflow = createWorkflow(
  "list-merchant-inventory",
  function (input: MerchantScopeInput) {
    const scope = validateMerchantScopeStep(input)
    const inventory = listMerchantInventoryStep({
      merchant_id: scope.merchant_id,
    })

    return new WorkflowResponse(inventory)
  },
)

export const retrieveMerchantReportsWorkflow = createWorkflow(
  "retrieve-merchant-reports",
  function (input: MerchantScopeInput) {
    const scope = validateMerchantScopeStep(input)
    const reports = retrieveMerchantReportsStep({
      merchant_id: scope.merchant_id,
    })

    return new WorkflowResponse(reports)
  },
)

export const retrieveMerchantHomeWorkflow = createWorkflow(
  "retrieve-merchant-home",
  function (input: MerchantScopeInput & { range: MerchantHomeRange }) {
    const scope = validateMerchantScopeStep(input)
    const { data: merchants } = useQueryGraphStep({
      entity: "merchant",
      fields: merchantHomeStoreFields,
      filters: { id: scope.merchant_id },
      options: { throwIfKeyNotFound: true },
    })
    const merchant = transform(
      { merchants },
      ({ merchants }) => merchants[0] as unknown as MerchantHomeStoreGraph,
    )
    const orderIds = transform({ merchant }, ({ merchant }) =>
      (merchant.orders ?? []).map(({ id }) => id),
    )
    const orders = getOrdersListWorkflow.runAsStep({
      input: {
        fields: [
          "id",
          "display_id",
          "status",
          "email",
          "customer_id",
          "currency_code",
          "total",
          "created_at",
          "items.product_id",
          "items.product_title",
          "items.title",
          "items.quantity",
          "items.total",
        ],
        variables: {
          id: orderIds,
          take: 10000,
          order: { created_at: "DESC" },
        },
      },
    })
    const home = buildMerchantHomeDataStep({
      merchant,
      range: input.range,
      orders,
    })

    return new WorkflowResponse(home)
  },
)

export const listMerchantActivityWorkflow = createWorkflow(
  "list-merchant-activity",
  function (input: MerchantScopeInput & { since?: string; limit?: number }) {
    const scope = validateMerchantScopeStep(input)
    const result = listMerchantActivityStep({
      merchant_id: scope.merchant_id,
      since: input.since,
      limit: input.limit,
    })

    return new WorkflowResponse(result)
  },
)

export const recordMerchantActivityWorkflow = createWorkflow(
  "record-merchant-activity",
  function (input: RecordMerchantActivityInput) {
    validateMerchantScopeStep(input)
    const result = recordMerchantActivityStep(input)

    return new WorkflowResponse(result)
  },
)

export const markMerchantNotificationReadWorkflow = createWorkflow(
  "mark-merchant-notification-read",
  function (input: MerchantScopeInput & { notification_id: string }) {
    const scope = validateMerchantScopeStep(input)
    const notification = markMerchantNotificationReadStep({
      merchant_id: scope.merchant_id,
      notification_id: input.notification_id,
    })

    return new WorkflowResponse(notification)
  },
)
