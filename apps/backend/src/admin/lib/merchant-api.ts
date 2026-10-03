import Medusa from "@medusajs/js-sdk"

export type MerchantRole = "owner" | "admin" | "staff"

export type MerchantIdentity = {
  id: string
  name: string
  slug: string
  status: string
  primary_sales_channel?: {
    id: string
    name: string
  } | null
}

export type MerchantMembership = {
  id: string
  actor_id: string
  role: MerchantRole
  status: "active"
}

export type MerchantSession = {
  merchant: MerchantIdentity
  member: MerchantMembership
  memberships: Array<{
    merchant: MerchantIdentity
    member: MerchantMembership
  }>
}

export type MerchantDomain = {
  id: string
  hostname: string
  type: "platform" | "custom"
  status: "pending" | "verified" | "active" | "disabled"
  is_primary: boolean
}

export type MerchantMember = {
  id: string
  actor_id: string
  role: MerchantRole
  status: "invited" | "active" | "suspended"
  user?: {
    id: string
    email: string
    first_name?: string | null
    last_name?: string | null
  } | null
}

export type MerchantInvitation = {
  id: string
  email: string
  role: "admin" | "staff"
  status: "pending" | "accepted" | "revoked"
  created_at: string
}

export type MerchantTheme = {
  id: string
  version: number
  configuration: {
    branding?: {
      name?: string
      primary_color?: string
      accent_color?: string
    }
    pages?: unknown[]
    [key: string]: unknown
  }
  is_active: boolean
}

export type MerchantPaymentConfig = {
  id: string
  provider: "mpesa_stk" | "mpesa_paybill"
  mode: "sandbox" | "production"
  status: "disabled" | "active"
  public_configuration: Record<string, unknown>
}

export type MerchantProduct = {
  id: string
  title: string
  handle: string
  status: "draft" | "proposed" | "published" | "rejected"
  thumbnail?: string | null
  description?: string | null
  subtitle?: string | null
  discountable?: boolean
  images?: Array<{ id: string; url: string }>
  options?: Array<{
    id: string
    title: string
    values?: Array<{ id: string; value: string }>
  }>
  collection?: { id: string; title: string } | null
  shipping_profile?: { id: string; name: string } | null
  collection_id?: string | null
  created_at?: string
  updated_at?: string
  categories?: Array<{ id: string; name?: string }>
  variants?: Array<{
    id: string
    title: string
    sku?: string | null
    manage_inventory?: boolean
    allow_backorder?: boolean
    prices?: Array<{
      id?: string
      amount: number
      currency_code: string
    }>
    options?: Array<{
      id: string
      value: string
      option?: { id: string; title: string }
    }>
    inventory?: Array<{
      id: string
      location_levels?: MerchantInventoryLevel[]
    }>
  }>
}

export type MerchantOrder = {
  id: string
  display_id: number
  status: string
  fulfillment_status?: string
  payment_status?: string
  no_notification?: boolean
  email?: string | null
  currency_code?: string
  total?: number
  created_at?: string
  updated_at?: string
  subtotal?: number
  tax_total?: number
  discount_total?: number
  shipping_total?: number
  customer_id?: string | null
  customer?: {
    id: string
    email?: string | null
    first_name?: string | null
    last_name?: string | null
    phone?: string | null
    company_name?: string | null
    has_account?: boolean
  } | null
  items?: MerchantOrderItem[]
  shipping_address?: MerchantAddress | null
  billing_address?: MerchantAddress | null
  payment_collections?: Array<{
    id: string
    status?: string
    amount?: number
    payments?: Array<{
      id: string
      amount: number
      currency_code?: string
      captured_at?: string | null
      refunds?: Array<{ id: string; amount: number; created_at?: string }>
    }>
  }>
  fulfillments?: Array<{
    id: string
    status?: string
    created_at?: string
    location_id?: string
    shipped_at?: string | null
    delivered_at?: string | null
    canceled_at?: string | null
    items?: Array<{ id: string; line_item_id?: string; quantity: number }>
    labels?: Array<{
      id: string
      tracking_number?: string
      tracking_url?: string
      label_url?: string
    }>
  }>
  metadata?: {
    merchant_notes?: Array<{
      id: string
      note: string
      actor_id: string
      created_at: string
    }>
    [key: string]: unknown
  } | null
}

export type MerchantOrderItem = {
  id: string
  title: string
  product_title?: string | null
  variant_title?: string | null
  variant_sku?: string | null
  thumbnail?: string | null
  quantity: number
  raw_quantity?: MerchantRawNumber
  requires_shipping?: boolean
  detail?: {
    fulfilled_quantity?: number
    raw_fulfilled_quantity?: MerchantRawNumber
    shipped_quantity?: number
    raw_shipped_quantity?: MerchantRawNumber
  } | null
  unit_price?: number
  raw_unit_price?: MerchantRawNumber
  total?: number
  product_id?: string | null
  variant_id?: string | null
  variant?: {
    id: string
    title?: string | null
    sku?: string | null
    product?: {
      id: string
      title?: string | null
      thumbnail?: string | null
    } | null
  } | null
}

export type MerchantRawNumber = {
  value: string | number
  precision?: number
}

export type MerchantAddress = {
  id?: string
  first_name?: string | null
  last_name?: string | null
  company?: string | null
  address_1?: string | null
  address_2?: string | null
  city?: string | null
  province?: string | null
  postal_code?: string | null
  country_code?: string | null
  phone?: string | null
}

export type MerchantCustomerProfile = {
  id: string
  customer_id: string
  status: string
  profile?: Record<string, unknown>
  created_at?: string
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
  first_order_at: string | null
  last_order_at: string | null
  created_at: string | null
}

export type MerchantCustomer = {
  id: string
  email?: string | null
  first_name?: string | null
  last_name?: string | null
  company_name?: string | null
  phone?: string | null
  has_account?: boolean
  metadata?: Record<string, unknown> | null
  addresses?: Array<MerchantAddress & {
    id: string
    address_name?: string | null
    is_default_shipping?: boolean
    is_default_billing?: boolean
  }>
  orders?: MerchantOrder[]
  segments?: MerchantCustomerSegmentSummary[]
  merchant_profile?: {
    id: string
    status: string
    preferences: Record<string, unknown>
    created_at?: string
    updated_at?: string
  } | null
}

export type MerchantCustomerSegmentSummary = {
  id: string
  name: string
  description: string | null
}

export type MerchantCustomerSegment = MerchantCustomerSegmentSummary & {
  customer_count: number
  created_at: string | null
  updated_at: string | null
}

export type MerchantCustomerSegmentMember = {
  id: string
  email: string | null
  first_name: string | null
  last_name: string | null
  company_name: string | null
  phone: string | null
  has_account: boolean
}

export type MerchantCustomerSegmentDetail = MerchantCustomerSegment & {
  customers: MerchantCustomerSegmentMember[]
}

export type MerchantCustomerSegmentListResponse = {
  customer_segments: MerchantCustomerSegment[]
  count: number
  limit: number
  offset: number
}

export type MerchantInventoryLevel = {
  id: string
  location_id: string
  stocked_quantity?: number
  reserved_quantity?: number
  incoming_quantity?: number
  available_quantity?: number
}

export type MerchantInventoryItem = {
  id: string
  title: string
  sku?: string | null
  product: { id: string; title: string }
  variant: { id: string; title: string; sku?: string | null }
  location_levels: MerchantInventoryLevel[]
}

export type MerchantReports = {
  currency_code: string
  metrics: {
    revenue: number
    order_count: number
    active_order_count: number
    canceled_order_count: number
    average_order_value: number
    product_count: number
    customer_count: number
  }
  orders_by_day: Array<{ date: string; orders: number; revenue: number }>
  product_performance: Array<{
    product_id: string
    title: string
    quantity: number
    revenue: number
  }>
}

export type MerchantHomeRange = "today" | "7d" | "30d"

export type MerchantHome = {
  merchant: MerchantIdentity
  period: {
    range: MerchantHomeRange
    label: string
    comparison_label: string
    current_start: string
    current_end: string
    previous_start: string
    previous_end: string
  }
  currency_code: string
  currency_codes: string[]
  has_mixed_currencies: boolean
  summary: {
    sales: number
    orders: number
    average_order_value: number
    customers: number
  }
  comparison: {
    sales: number | null
    orders: number | null
    average_order_value: number | null
    customers: number | null
  }
  sales_by_day: Array<{
    date: string
    orders: number
    revenue: number
  }>
  attention: Array<{
    id: string
    label: string
    description: string
    count: number
    to: string
  }>
  recent_orders: Array<{
    id: string
    display_id: number
    status: string
    fulfillment_status?: string | null
    payment_status?: string | null
    email?: string | null
    currency_code: string
    total: number
    created_at?: string | null
  }>
  top_products: Array<{
    product_id: string | null
    title: string
    quantity: number
    revenue: number
  }>
  store_health: {
    status: "live" | "needs_setup"
    storefront_url: string | null
    completed: number
    total: number
    checks: MerchantHomeHealthCheck[]
  }
  onboarding: {
    visible: boolean
    completed: number
    total: number
    steps: MerchantHomeHealthCheck[]
  }
}

export type MerchantHomeHealthCheck = {
  id: string
  label: string
  description: string
  complete: boolean
  to: string
}

export type MerchantActivity = {
  id: string
  actor_id?: string | null
  action: string
  resource_type: string
  resource_id?: string | null
  description: string
  metadata?: Record<string, unknown>
  created_at?: string
}

export type MerchantNotification = {
  id: string
  type: string
  severity: "info" | "warning" | "critical"
  title: string
  message: string
  resource_type?: string | null
  resource_id?: string | null
  read_at?: string | null
  created_at?: string
}

export type MerchantStockLocation = {
  id: string
  name: string
  address?: {
    address_1?: string | null
    address_2?: string | null
    city?: string | null
    province?: string | null
    postal_code?: string | null
    country_code?: string | null
  } | null
  created_at?: string
  updated_at?: string
}

export type MerchantShippingProfile = {
  id: string
  name: string
  type: string
}

export type MerchantDeliveryMethod = {
  id: string
  name: string
  description: string | null
  estimated_delivery: string | null
  is_enabled: boolean
  is_default: boolean
  stock_location: {
    id: string
    name: string
  }
  shipping_profile: MerchantShippingProfile
  service_zone: {
    id: string
    name: string
    fulfillment_set_id: string
    country_codes: string[]
  }
  price: {
    id: string
    amount: number
    currency_code: string
  } | null
  created_at?: string
  updated_at?: string
}

export type MerchantDeliverySettings = {
  stock_locations: MerchantStockLocation[]
  shipping_profiles: MerchantShippingProfile[]
  regions: Array<{
    id: string
    name: string
    currency_code: string
    country_codes: string[]
  }>
  delivery_options: MerchantDeliveryMethod[]
}

export type MerchantDashboard = MerchantIdentity & {
  created_at?: string
  updated_at?: string
  domains?: MerchantDomain[]
  members?: MerchantMember[]
  invitations?: MerchantInvitation[]
  themes?: MerchantTheme[]
  payment_configs?: MerchantPaymentConfig[]
  products?: MerchantProduct[]
  orders?: MerchantOrder[]
  stock_locations?: MerchantStockLocation[]
  customer_profiles?: MerchantCustomerProfile[]
  customers?: MerchantCustomerListItem[]
}

const sdk = new Medusa({
  baseUrl: import.meta.env.VITE_BACKEND_URL || "/",
  debug: import.meta.env.DEV,
  auth: { type: "session" },
})

const activeMerchantStorageKey = "merchant-platform:active-merchant"

export function getActiveMerchantId(): string | undefined {
  if (typeof window === "undefined") {
    return undefined
  }

  return window.localStorage.getItem(activeMerchantStorageKey) || undefined
}

export function setActiveMerchantId(merchantId: string): void {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(activeMerchantStorageKey, merchantId)
  }
}

export function clearActiveMerchantId(): void {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(activeMerchantStorageKey)
  }
}

async function requestMerchantSession(
  merchantId?: string
): Promise<MerchantSession> {
  const query = merchantId
    ? `?merchant_id=${encodeURIComponent(merchantId)}`
    : ""

  return sdk.client.fetch<MerchantSession>(
    `/admin/merchant-session${query}`,
    { method: "GET" }
  )
}

export const merchantQueryKeys = {
  session: ["merchant", "session"] as const,
  dashboard: (merchantId: string) =>
    ["merchant", merchantId, "dashboard"] as const,
  home: (merchantId: string, range: MerchantHomeRange) =>
    ["merchant", merchantId, "home", range] as const,
  resource: (merchantId: string, resource: string) =>
    ["merchant", merchantId, resource] as const,
}

export const merchantApi = {
  session: async () => {
    const activeMerchantId = getActiveMerchantId()

    try {
      const session = await requestMerchantSession(activeMerchantId)
      setActiveMerchantId(session.merchant.id)
      return session
    } catch (error) {
      if (!activeMerchantId) {
        throw error
      }

      clearActiveMerchantId()
      const session = await requestMerchantSession()
      setActiveMerchantId(session.merchant.id)
      return session
    }
  },

  dashboard: async (merchantId: string) => {
    const response = await sdk.client.fetch<{
      merchant: MerchantDashboard
    }>(`/admin/merchants/${merchantId}`, { method: "GET" })

    return response.merchant
  },

  home: async (merchantId: string, range: MerchantHomeRange) => {
    const response = await sdk.client.fetch<{ home: MerchantHome }>(
      `/admin/merchants/${merchantId}/home?range=${range}`,
      { method: "GET" }
    )

    return response.home
  },

  get: <T>(merchantId: string, suffix: string) =>
    sdk.client.fetch<T>(`/admin/merchants/${merchantId}${suffix}`, {
      method: "GET",
    }),

  post: <T>(
    merchantId: string,
    suffix: string,
    body: Record<string, unknown>
  ) =>
    sdk.client.fetch<T>(`/admin/merchants/${merchantId}${suffix}`, {
      method: "POST",
      body,
    }),

  upload: (merchantId: string, files: File[]) => {
    const body = new FormData()
    files.forEach((file) => body.append("files", file))

    return sdk.client.fetch<{ files: Array<{ id: string; url: string }> }>(
      `/admin/merchants/${merchantId}/uploads`,
      {
        method: "POST",
        headers: { "content-type": null },
        body,
      }
    )
  },

  delete: <T>(merchantId: string, suffix: string) =>
    sdk.client.fetch<T>(`/admin/merchants/${merchantId}${suffix}`, {
      method: "DELETE",
    }),
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message
  }

  return "The request could not be completed"
}

export function canManageMerchant(role: MerchantRole): boolean {
  return role === "owner" || role === "admin"
}

export function formatMoney(
  amount: number | undefined,
  currencyCode = "KES"
): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currencyCode.toUpperCase(),
  }).format(amount ?? 0)
}

export function downloadCsv(
  filename: string,
  rows: Array<Record<string, string | number | boolean | null | undefined>>
) {
  if (!rows.length) {
    return false
  }

  const headers = Object.keys(rows[0])
  const escape = (value: unknown) => {
    const text = String(value ?? "")
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  const csv = [
    headers.map(escape).join(","),
    ...rows.map((row) => headers.map((header) => escape(row[header])).join(",")),
  ].join("\r\n")
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }))
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
  return true
}

export function parseCsv(text: string) {
  const rows: string[][] = []
  let row: string[] = []
  let value = ""
  let quoted = false

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    const next = text[index + 1]

    if (character === '"' && quoted && next === '"') {
      value += '"'
      index += 1
    } else if (character === '"') {
      quoted = !quoted
    } else if (character === "," && !quoted) {
      row.push(value.trim())
      value = ""
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1
      row.push(value.trim())
      if (row.some(Boolean)) rows.push(row)
      row = []
      value = ""
    } else {
      value += character
    }
  }

  row.push(value.trim())
  if (row.some(Boolean)) rows.push(row)
  const [headers = [], ...values] = rows

  return values.map((columns) => Object.fromEntries(
    headers.map((header, index) => [header.trim().toLowerCase(), columns[index] ?? ""])
  ))
}

export function formatDate(value?: string): string {
  if (!value) {
    return "—"
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}
