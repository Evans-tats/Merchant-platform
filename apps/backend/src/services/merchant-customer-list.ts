import { isPlacedOrder } from "./merchant-home"

export type MerchantCustomerSource = {
  id: string
  email?: string | null
  first_name?: string | null
  last_name?: string | null
  company_name?: string | null
  phone?: string | null
  has_account?: boolean
  created_at?: Date | string
}

export type MerchantCustomerOrderSource = {
  id: string
  customer_id?: string | null
  email?: string | null
  status?: string | null
  currency_code?: string | null
  total?: number | null
  created_at?: Date | string
  customer?: MerchantCustomerSource | null
}

export type MerchantCustomerProfileSource = {
  id: string
  customer_id: string
  status: string
  profile?: Record<string, unknown>
  created_at?: Date | string
  customer?: MerchantCustomerSource | null
}

export type MerchantCustomerListItem = {
  id: string
  customer_id: string | null
  merchant_profile_id: string | null
  status: string
  email: string | null
  first_name: string | null
  last_name: string | null
  company_name: string | null
  phone: string | null
  has_account: boolean
  order_count: number
  // Orders that weren't canceled or left as drafts, and what they came to.
  placed_order_count: number
  total_spent: number
  // The currency of the placed orders. Null when there are none, or when
  // they're in more than one currency and total_spent mixes them.
  currency_code: string | null
  first_order_at: string | null
  last_order_at: string | null
  created_at: string | null
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function isoValue(value: Date | string | undefined): string | null {
  if (!value) {
    return null
  }

  const date = value instanceof Date ? value : new Date(value)

  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function earlier(left: string | null, right: string | null): string | null {
  if (!left) return right
  if (!right) return left

  return left < right ? left : right
}

function later(left: string | null, right: string | null): string | null {
  if (!left) return right
  if (!right) return left

  return left > right ? left : right
}

function customerKey(
  customerId: string | null | undefined,
  email: string | null | undefined,
  fallback: string
) {
  if (customerId) return `customer:${customerId}`

  const normalizedEmail = email?.trim().toLowerCase()

  return normalizedEmail ? `email:${normalizedEmail}` : `order:${fallback}`
}

function profileField(
  profile: Record<string, unknown> | undefined,
  field: string
) {
  return stringValue(profile?.[field])
}

// Counts the order towards what the customer spent, like the home page
// counts sales: canceled and draft orders don't count.
function addPlacedOrder(
  customer: MerchantCustomerListItem,
  order: MerchantCustomerOrderSource
) {
  if (!isPlacedOrder({ status: order.status ?? "" })) {
    return
  }

  const currency = stringValue(order.currency_code)?.toLowerCase() ?? null

  customer.currency_code =
    customer.placed_order_count === 0 || customer.currency_code === currency
      ? currency
      : null
  customer.placed_order_count += 1
  customer.total_spent += Number(order.total ?? 0)
}

export function buildMerchantCustomerList(input: {
  orders?: MerchantCustomerOrderSource[]
  customerProfiles?: MerchantCustomerProfileSource[]
}): MerchantCustomerListItem[] {
  const customers = new Map<string, MerchantCustomerListItem>()

  for (const profile of input.customerProfiles ?? []) {
    const customer = profile.customer
    const createdAt = isoValue(customer?.created_at ?? profile.created_at)
    const key = customerKey(
      profile.customer_id,
      customer?.email ?? profileField(profile.profile, "email"),
      profile.id
    )

    customers.set(key, {
      id: profile.customer_id,
      customer_id: profile.customer_id,
      merchant_profile_id: profile.id,
      status: profile.status,
      email:
        stringValue(customer?.email) ?? profileField(profile.profile, "email"),
      first_name:
        profileField(profile.profile, "first_name") ??
        stringValue(customer?.first_name),
      last_name:
        profileField(profile.profile, "last_name") ??
        stringValue(customer?.last_name),
      company_name:
        profileField(profile.profile, "company_name") ??
        stringValue(customer?.company_name),
      phone:
        profileField(profile.profile, "phone") ?? stringValue(customer?.phone),
      has_account: customer?.has_account === true,
      order_count: 0,
      placed_order_count: 0,
      total_spent: 0,
      currency_code: null,
      first_order_at: null,
      last_order_at: null,
      created_at: createdAt,
    })
  }

  for (const order of input.orders ?? []) {
    const customer = order.customer
    const customerId = order.customer_id ?? customer?.id ?? null
    const email = stringValue(customer?.email) ?? stringValue(order.email)
    const key = customerKey(customerId, email, order.id)
    const orderCreatedAt = isoValue(order.created_at)
    const customerCreatedAt = isoValue(customer?.created_at)
    const existing = customers.get(key)

    if (!existing) {
      const created: MerchantCustomerListItem = {
        id: customerId ?? key,
        customer_id: customerId,
        merchant_profile_id: null,
        status: "active",
        email,
        first_name: stringValue(customer?.first_name),
        last_name: stringValue(customer?.last_name),
        company_name: stringValue(customer?.company_name),
        phone: stringValue(customer?.phone),
        has_account: customer?.has_account === true,
        order_count: 1,
        placed_order_count: 0,
        total_spent: 0,
        currency_code: null,
        first_order_at: orderCreatedAt,
        last_order_at: orderCreatedAt,
        created_at: customerCreatedAt ?? orderCreatedAt,
      }

      addPlacedOrder(created, order)
      customers.set(key, created)
      continue
    }

    existing.email ??= email
    existing.first_name ??= stringValue(customer?.first_name)
    existing.last_name ??= stringValue(customer?.last_name)
    existing.company_name ??= stringValue(customer?.company_name)
    existing.phone ??= stringValue(customer?.phone)
    existing.has_account ||= customer?.has_account === true
    existing.order_count += 1
    addPlacedOrder(existing, order)
    existing.first_order_at = earlier(existing.first_order_at, orderCreatedAt)
    existing.last_order_at = later(existing.last_order_at, orderCreatedAt)
    existing.created_at = earlier(
      existing.created_at,
      customerCreatedAt ?? orderCreatedAt
    )
  }

  return Array.from(customers.values()).sort((left, right) => {
    const leftActivity = left.last_order_at ?? left.created_at ?? ""
    const rightActivity = right.last_order_at ?? right.created_at ?? ""

    return rightActivity.localeCompare(leftActivity) || left.id.localeCompare(right.id)
  })
}
