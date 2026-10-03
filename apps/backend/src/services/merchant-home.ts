export type MerchantHomeRange = "today" | "7d" | "30d"

export type MerchantHomePeriod = {
  range: MerchantHomeRange
  label: string
  comparison_label: string
  current_start: string
  current_end: string
  previous_start: string
  previous_end: string
}

export type MerchantHomeOrderSource = {
  id: string
  display_id?: number | string | null
  status: string
  fulfillment_status?: string | null
  payment_status?: string | null
  email?: string | null
  customer_id?: string | null
  currency_code?: string | null
  total?: number | null
  created_at?: Date | string | null
  items?: Array<{
    product_id?: string | null
    product_title?: string | null
    title?: string | null
    quantity?: number | null
    total?: number | null
  }>
}

export type MerchantHomeStoreSource = {
  id: string
  name: string
  slug: string
  status: string
  domains?: Array<{
    hostname: string
    status: string
    is_primary?: boolean
  }>
  payment_configs?: Array<{
    provider: string
    mode: string
    status: string
  }>
  products?: Array<{
    id: string
    title: string
    status: string
    thumbnail?: string | null
    variants?: Array<{
      id: string
      manage_inventory?: boolean
      inventory?: Array<{
        location_levels?: Array<{
          available_quantity?: number | null
          stocked_quantity?: number | null
          reserved_quantity?: number | null
        }>
      }>
    }>
  }>
  stock_locations?: Array<{ id: string }>
}

type MerchantHomeInput = {
  merchant: MerchantHomeStoreSource
  period: MerchantHomePeriod
  period_orders: MerchantHomeOrderSource[]
  attention_orders: MerchantHomeOrderSource[]
  recent_orders: MerchantHomeOrderSource[]
}

const dayInMilliseconds = 24 * 60 * 60 * 1000
const nairobiTimeZone = "Africa/Nairobi"

const dateKey = (value: Date | string) => {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: nairobiTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value))
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? ""

  return `${part("year")}-${part("month")}-${part("day")}`
}

const nairobiStartOfDay = (value: Date) => {
  const key = dateKey(value)

  return new Date(`${key}T00:00:00+03:00`)
}

const isPlacedOrder = ({ status }: MerchantHomeOrderSource) =>
  !["canceled", "cancelled", "draft"].includes(status)

const numericTotal = (order: MerchantHomeOrderSource) =>
  Number(order.total ?? 0)

const percentageChange = (current: number, previous: number) => {
  if (previous === 0) {
    return current === 0 ? 0 : null
  }

  return ((current - previous) / previous) * 100
}

const uniqueCustomerCount = (orders: MerchantHomeOrderSource[]) => {
  const customers = new Set<string>()

  for (const order of orders) {
    if (order.customer_id) {
      customers.add(`customer:${order.customer_id}`)
    } else if (order.email?.trim()) {
      customers.add(`email:${order.email.trim().toLowerCase()}`)
    } else {
      customers.add(`order:${order.id}`)
    }
  }

  return customers.size
}

export const resolveMerchantHomePeriod = (
  range: MerchantHomeRange,
  now = new Date(),
): MerchantHomePeriod => {
  const days = range === "today" ? 1 : range === "7d" ? 7 : 30
  const today = nairobiStartOfDay(now)
  const currentStart = new Date(
    today.getTime() - (days - 1) * dayInMilliseconds,
  )
  const currentEnd = now
  const currentDuration = currentEnd.getTime() - currentStart.getTime()
  const previousEnd = currentStart
  const previousStart = new Date(previousEnd.getTime() - currentDuration)

  return {
    range,
    label: range === "today" ? "Today" : `Last ${days} days`,
    comparison_label:
      range === "today" ? "vs the same time yesterday" : "vs previous period",
    current_start: currentStart.toISOString(),
    current_end: currentEnd.toISOString(),
    previous_start: previousStart.toISOString(),
    previous_end: previousEnd.toISOString(),
  }
}

export const buildMerchantHome = ({
  merchant,
  period,
  period_orders: periodOrders,
  attention_orders: attentionOrders,
  recent_orders: recentOrders,
}: MerchantHomeInput) => {
  const currentStart = new Date(period.current_start).getTime()
  const currentEnd = new Date(period.current_end).getTime()
  const previousStart = new Date(period.previous_start).getTime()
  const previousEnd = new Date(period.previous_end).getTime()
  const orderTime = (order: MerchantHomeOrderSource) =>
    new Date(order.created_at ?? 0).getTime()
  const placedPeriodOrders = periodOrders.filter(isPlacedOrder)
  const currentOrders = placedPeriodOrders.filter((order) => {
    const createdAt = orderTime(order)
    return createdAt >= currentStart && createdAt <= currentEnd
  })
  const previousOrders = placedPeriodOrders.filter((order) => {
    const createdAt = orderTime(order)
    return createdAt >= previousStart && createdAt < previousEnd
  })
  const currencyCodes = Array.from(
    new Set(
      [...currentOrders, ...previousOrders, ...recentOrders]
        .map(({ currency_code }) => currency_code?.toLowerCase())
        .filter((value): value is string => Boolean(value)),
    ),
  )
  const currencyCode = currencyCodes.includes("kes")
    ? "kes"
    : (currencyCodes[0] ?? "kes")
  const inCurrency = (order: MerchantHomeOrderSource) =>
    (order.currency_code?.toLowerCase() ?? currencyCode) === currencyCode
  const currentCurrencyOrders = currentOrders.filter(inCurrency)
  const previousCurrencyOrders = previousOrders.filter(inCurrency)
  const currentRevenue = currentCurrencyOrders.reduce(
    (sum, order) => sum + numericTotal(order),
    0,
  )
  const previousRevenue = previousCurrencyOrders.reduce(
    (sum, order) => sum + numericTotal(order),
    0,
  )
  const currentAverage = currentCurrencyOrders.length
    ? currentRevenue / currentCurrencyOrders.length
    : 0
  const previousAverage = previousCurrencyOrders.length
    ? previousRevenue / previousCurrencyOrders.length
    : 0
  const currentCustomers = uniqueCustomerCount(currentCurrencyOrders)
  const previousCustomers = uniqueCustomerCount(previousCurrencyOrders)
  const salesByDay = new Map<
    string,
    { date: string; orders: number; revenue: number }
  >()

  for (
    let timestamp = nairobiStartOfDay(new Date(period.current_start)).getTime();
    timestamp <= currentEnd;
    timestamp += dayInMilliseconds
  ) {
    const date = dateKey(new Date(timestamp))
    salesByDay.set(date, { date, orders: 0, revenue: 0 })
  }

  for (const order of currentCurrencyOrders) {
    const date = dateKey(order.created_at ?? period.current_start)
    const day = salesByDay.get(date)

    if (day) {
      day.orders += 1
      day.revenue += numericTotal(order)
    }
  }

  const products = merchant.products ?? []
  const lowStockVariants = products.reduce((count, product) => {
    return (
      count +
      (product.variants ?? []).filter((variant) => {
        if (!variant.manage_inventory) {
          return false
        }

        const levels = (variant.inventory ?? []).flatMap(
          ({ location_levels }) => location_levels ?? [],
        )
        const available = levels.reduce((sum, level) => {
          return (
            sum +
            Number(
              level.available_quantity ??
                Number(level.stocked_quantity ?? 0) -
                  Number(level.reserved_quantity ?? 0),
            )
          )
        }, 0)

        return levels.length === 0 || available <= 5
      }).length
    )
  }, 0)
  const activeAttentionOrders = attentionOrders.filter(isPlacedOrder)
  const fulfillmentAttention = activeAttentionOrders.filter((order) =>
    ["not_fulfilled", "partially_fulfilled"].includes(
      order.fulfillment_status ?? "not_fulfilled",
    ),
  ).length
  const paymentAttention = activeAttentionOrders.filter((order) =>
    [
      "not_paid",
      "awaiting",
      "requires_action",
      "authorized",
      "partially_captured",
    ].includes(order.payment_status ?? "not_paid"),
  ).length
  const draftProducts = products.filter(({ status }) =>
    ["draft", "proposed", "rejected"].includes(status),
  ).length
  const productPerformance = new Map<
    string,
    {
      product_id: string | null
      title: string
      quantity: number
      revenue: number
    }
  >()

  for (const order of currentCurrencyOrders) {
    for (const item of order.items ?? []) {
      const key = item.product_id ?? `unassigned:${item.title ?? "product"}`
      const existing = productPerformance.get(key) ?? {
        product_id: item.product_id ?? null,
        title: item.product_title || item.title || "Unknown product",
        quantity: 0,
        revenue: 0,
      }

      existing.quantity += Number(item.quantity ?? 0)
      existing.revenue += Number(item.total ?? 0)
      productPerformance.set(key, existing)
    }
  }

  const primaryDomain = [...(merchant.domains ?? [])].sort(
    (left, right) =>
      Number(Boolean(right.is_primary)) - Number(Boolean(left.is_primary)),
  )[0]
  const domainReady = Boolean(
    primaryDomain && ["active", "verified"].includes(primaryDomain.status),
  )
  const mpesaConfig = (merchant.payment_configs ?? []).find(
    ({ provider, status }) =>
      provider.startsWith("mpesa_") && status === "active",
  )
  const locationReady = Boolean(merchant.stock_locations?.length)
  const publishedProducts = products.filter(
    ({ status }) => status === "published",
  ).length
  const healthChecks = [
    {
      id: "mpesa",
      label: "M-Pesa payments",
      description: mpesaConfig
        ? `${mpesaConfig.mode} mode is active`
        : "Connect an active M-Pesa payment method",
      complete: Boolean(mpesaConfig),
      to: "/merchant/settings",
    },
    {
      id: "domain",
      label: "Store domain",
      description: domainReady
        ? primaryDomain!.hostname
        : "Verify a storefront domain",
      complete: domainReady,
      to: "/merchant/settings",
    },
    {
      id: "location",
      label: "Stock location",
      description: locationReady
        ? `${merchant.stock_locations!.length} location${merchant.stock_locations!.length === 1 ? "" : "s"} configured`
        : "Create a stock location",
      complete: locationReady,
      to: "/merchant-locations",
    },
    {
      id: "products",
      label: "Published products",
      description: publishedProducts
        ? `${publishedProducts} product${publishedProducts === 1 ? "" : "s"} live`
        : "Publish your first product",
      complete: publishedProducts > 0,
      to: "/merchant-products",
    },
  ]
  const completedHealthChecks = healthChecks.filter(
    ({ complete }) => complete,
  ).length

  return {
    merchant: {
      id: merchant.id,
      name: merchant.name,
      slug: merchant.slug,
      status: merchant.status,
    },
    period,
    currency_code: currencyCode,
    currency_codes: currencyCodes.length ? currencyCodes : [currencyCode],
    has_mixed_currencies: currencyCodes.length > 1,
    summary: {
      sales: currentRevenue,
      orders: currentCurrencyOrders.length,
      average_order_value: currentAverage,
      customers: currentCustomers,
    },
    comparison: {
      sales: percentageChange(currentRevenue, previousRevenue),
      orders: percentageChange(
        currentCurrencyOrders.length,
        previousCurrencyOrders.length,
      ),
      average_order_value: percentageChange(currentAverage, previousAverage),
      customers: percentageChange(currentCustomers, previousCustomers),
    },
    sales_by_day: Array.from(salesByDay.values()),
    attention: [
      {
        id: "fulfillment",
        label: "Orders to fulfill",
        description: "Paid or placed orders still awaiting fulfillment",
        count: fulfillmentAttention,
        to: "/merchant-orders",
      },
      {
        id: "payments",
        label: "M-Pesa payments to review",
        description: "Orders awaiting capture or payment action",
        count: paymentAttention,
        to: "/merchant-orders",
      },
      {
        id: "inventory",
        label: "Low-stock variants",
        description: "Inventory variants with five or fewer units available",
        count: lowStockVariants,
        to: "/merchant-inventory",
      },
      {
        id: "products",
        label: "Products to publish",
        description: "Draft, proposed, or rejected products",
        count: draftProducts,
        to: "/merchant-products",
      },
    ],
    recent_orders: recentOrders.slice(0, 5).map((order) => ({
      id: order.id,
      display_id: Number(order.display_id ?? 0),
      status: order.status,
      fulfillment_status: order.fulfillment_status,
      payment_status: order.payment_status,
      email: order.email,
      currency_code: order.currency_code ?? currencyCode,
      total: numericTotal(order),
      created_at: order.created_at,
    })),
    top_products: Array.from(productPerformance.values())
      .sort((left, right) => right.revenue - left.revenue)
      .slice(0, 5),
    store_health: {
      status:
        merchant.status === "active" &&
        completedHealthChecks === healthChecks.length
          ? "live"
          : "needs_setup",
      storefront_url: domainReady ? `https://${primaryDomain!.hostname}` : null,
      completed: completedHealthChecks,
      total: healthChecks.length,
      checks: healthChecks,
    },
    onboarding: {
      visible: completedHealthChecks < healthChecks.length,
      completed: completedHealthChecks,
      total: healthChecks.length,
      steps: healthChecks,
    },
  }
}
