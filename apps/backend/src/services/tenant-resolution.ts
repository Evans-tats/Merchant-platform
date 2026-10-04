import type { MedusaContainer } from "@medusajs/framework"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"

declare const resolvedMerchantIdBrand: unique symbol

/**
 * A merchant ID produced by tenant resolution. Route payloads and query
 * parameters intentionally remain plain strings and cannot satisfy this type.
 */
export type ResolvedMerchantId = string & {
  readonly [resolvedMerchantIdBrand]: true
}

export type MerchantMemberRole = "owner" | "admin" | "staff"

type ResolvedMerchant = {
  id: ResolvedMerchantId
  name: string
  slug: string
  status: "active"
}

export type StoreMerchantContext = {
  merchant: ResolvedMerchant
  domain: {
    id: string
    hostname: string
    is_primary: boolean
  }
  salesChannel: {
    id: string
    name: string
  }
  publishableApiKey: {
    id: string
    type: "publishable"
  }
}

export type StaffMerchantContext = {
  merchant: ResolvedMerchant
  salesChannel: {
    id: string
    name: string
  }
  member: {
    id: string
    actor_id: string
    role: MerchantMemberRole
    status: "active"
  }
}

export type ResolveStaffMerchantOptions = {
  /** Restrict an operation to these roles after membership is established. */
  allowed_roles?: readonly MerchantMemberRole[]
}

export type MerchantOwnedResourceType =
  | "merchant"
  | "sales_channel"
  | "product"
  | "product_category"
  | "product_collection"
  | "stock_location"
  | "shipping_profile"
  | "cart"
  | "order"
  | "merchant_domain"
  | "merchant_member"
  | "merchant_theme"
  | "merchant_payment_config"
  | "merchant_customer_profile"
  | "merchant_customer_address"
  | "customer_group"
  | "promotion"
  | "campaign"

type StoreDomainGraph = {
  id: string
  hostname: string
  status: string
  is_primary: boolean
  merchant?: {
    id: string
    name: string
    slug: string
    status: string
    primary_sales_channel?: {
      id: string
      name: string
    } | null
  } | null
}

type PublishableApiKeyGraph = {
  id: string
  token: string
  type: string
  revoked_at?: Date | string | null
  sales_channels?: Array<{
    id: string
  }>
}

type PublicStorefrontDomainGraph = {
  id: string
  hostname: string
  type: string
  is_primary: boolean
  merchant?: {
    id: string
    name: string
    slug: string
    status: string
    primary_sales_channel?: {
      id: string
      name: string
      publishable_api_keys?: PublishableApiKeyGraph[]
    } | null
  } | null
}

export type PublicStorefrontConfiguration = {
  merchant: {
    id: string
    name: string
    slug: string
  }
  domain: {
    hostname: string
    type: "platform" | "custom"
    is_primary: boolean
  }
  sales_channel: {
    id: string
    name: string
  }
  publishable_api_key: string
}

type StaffMemberGraph = {
  id: string
  actor_id: string
  role: string
  status: string
  user?: {
    id: string
  } | null
  merchant?: {
    id: string
    name: string
    slug: string
    status: string
    primary_sales_channel?: {
      id: string
      name: string
    } | null
  } | null
}

type MerchantCatalogGraph = {
  products?: Array<{
    id: string
    sales_channels?: Array<{ id: string }>
    options?: Array<{ id: string }>
  }>
  product_categories?: Array<{ id: string }>
  product_collections?: Array<{ id: string }>
  stock_locations?: Array<{ id: string }>
  orders?: Array<{
    id: string
    customer_id?: string | null
  }>
}

type ProductVariantGraph = {
  id: string
  manage_inventory?: boolean
  allow_backorder?: boolean
  product?: {
    id: string
  } | null
  inventory?: Array<{
    id: string
    location_levels?: Array<{
      location_id: string
    }>
  }>
}

type CartGraph = {
  id: string
  sales_channel_id?: string | null
  merchant?: {
    id: string
  } | null
}

const ownershipPathByResourceType: Record<
  Exclude<MerchantOwnedResourceType, "merchant">,
  string
> = {
  sales_channel: "merchant",
  product: "merchant",
  product_category: "merchant",
  product_collection: "merchant",
  stock_location: "merchant",
  shipping_profile: "merchant",
  cart: "merchant",
  order: "merchant",
  merchant_domain: "merchant",
  merchant_member: "merchant",
  merchant_theme: "merchant",
  merchant_payment_config: "merchant",
  merchant_customer_profile: "merchant",
  merchant_customer_address: "merchant_customer_profile.merchant",
  customer_group: "merchant",
  promotion: "merchant",
  campaign: "merchant",
}

const hostnameLabelPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

export function normalizeHostname(hostname: string): string {
  const value = hostname?.trim()

  if (
    !value ||
    value.includes("/") ||
    value.includes("\\") ||
    value.includes("@") ||
    value.includes("?") ||
    value.includes("#") ||
    /\s/.test(value)
  ) {
    throw invalidHostnameError()
  }

  let normalized: string

  try {
    normalized = new URL(`http://${value}`).hostname
      .toLowerCase()
      .replace(/\.$/, "")
  } catch {
    throw invalidHostnameError()
  }

  const labels = normalized.split(".")

  if (
    normalized.length > 253 ||
    !labels.length ||
    labels.some((label) => !hostnameLabelPattern.test(label))
  ) {
    throw invalidHostnameError()
  }

  return normalized
}

/**
 * Resolves the merchant selected by a request host and requires the supplied
 * publishable key to be scoped only to that merchant's primary sales channel.
 */
export async function resolveStoreMerchant(
  container: MedusaContainer,
  hostname: string,
  publishableKey: string
): Promise<StoreMerchantContext> {
  let normalizedHostname: string

  try {
    normalizedHostname = normalizeHostname(hostname)
  } catch {
    throw storefrontNotFoundError()
  }

  const key = publishableKey?.trim()

  if (!key) {
    throw storefrontNotFoundError()
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: domainData } = await query.graph({
    entity: "merchant_domain",
    fields: [
      "id",
      "hostname",
      "status",
      "is_primary",
      "merchant.id",
      "merchant.name",
      "merchant.slug",
      "merchant.status",
      "merchant.primary_sales_channel.id",
      "merchant.primary_sales_channel.name",
    ],
    filters: {
      hostname: normalizedHostname,
      status: "active",
    },
  })
  const domains = domainData as unknown as StoreDomainGraph[]
  const domain = domains.length === 1 ? domains[0] : undefined
  const merchant = domain?.merchant
  const salesChannel = merchant?.primary_sales_channel

  if (
    !domain ||
    domain.status !== "active" ||
    domain.hostname !== normalizedHostname ||
    !merchant ||
    merchant.status !== "active" ||
    !salesChannel
  ) {
    throw storefrontNotFoundError()
  }

  const { data: apiKeyData } = await query.graph({
    entity: "api_key",
    fields: [
      "id",
      "type",
      "revoked_at",
      "sales_channels.id",
    ],
    filters: {
      token: key,
      type: "publishable",
    },
  })
  const apiKeys = apiKeyData as unknown as PublishableApiKeyGraph[]
  const apiKey = apiKeys.length === 1 ? apiKeys[0] : undefined
  const scopedSalesChannels = apiKey?.sales_channels ?? []

  if (
    !apiKey ||
    apiKey.type !== "publishable" ||
    apiKey.revoked_at != null ||
    scopedSalesChannels.length !== 1 ||
    scopedSalesChannels[0].id !== salesChannel.id
  ) {
    throw storefrontNotFoundError()
  }

  return {
    merchant: {
      id: asResolvedMerchantId(merchant.id),
      name: merchant.name,
      slug: merchant.slug,
      status: "active",
    },
    domain: {
      id: domain.id,
      hostname: domain.hostname,
      is_primary: domain.is_primary,
    },
    salesChannel: {
      id: salesChannel.id,
      name: salesChannel.name,
    },
    publishableApiKey: {
      id: apiKey.id,
      type: "publishable",
    },
  }
}

/**
 * Resolves the public bootstrap values needed by a storefront before it can
 * make an authenticated Store API request. No payment secrets, verification
 * tokens, staff data, or configuration for another merchant are returned.
 */
export async function resolvePublicStorefrontConfiguration(
  container: MedusaContainer,
  hostname: string
): Promise<PublicStorefrontConfiguration> {
  let normalizedHostname: string

  try {
    normalizedHostname = normalizeHostname(hostname)
  } catch {
    throw storefrontNotFoundError()
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "merchant_domain",
    fields: [
      "id",
      "hostname",
      "type",
      "status",
      "is_primary",
      "merchant.id",
      "merchant.name",
      "merchant.slug",
      "merchant.status",
      "merchant.primary_sales_channel.id",
      "merchant.primary_sales_channel.name",
      "merchant.primary_sales_channel.publishable_api_keys.id",
      "merchant.primary_sales_channel.publishable_api_keys.token",
      "merchant.primary_sales_channel.publishable_api_keys.type",
      "merchant.primary_sales_channel.publishable_api_keys.revoked_at",
      "merchant.primary_sales_channel.publishable_api_keys.sales_channels.id",
    ],
    filters: {
      hostname: normalizedHostname,
      status: "active",
    },
  })
  const domains = data as unknown as PublicStorefrontDomainGraph[]
  const domain = domains.length === 1 ? domains[0] : undefined
  const merchant = domain?.merchant
  const salesChannel = merchant?.primary_sales_channel
  const apiKeys = (salesChannel?.publishable_api_keys ?? []).filter(
    (apiKey) => {
      return (
        apiKey.type === "publishable" &&
        apiKey.revoked_at == null &&
        apiKey.sales_channels?.length === 1 &&
        apiKey.sales_channels[0].id === salesChannel?.id
      )
    }
  )
  const apiKey = apiKeys.length === 1 ? apiKeys[0] : undefined

  if (
    !domain ||
    domain.hostname !== normalizedHostname ||
    (domain.type !== "platform" && domain.type !== "custom") ||
    !merchant ||
    merchant.status !== "active" ||
    !salesChannel ||
    !apiKey
  ) {
    throw storefrontNotFoundError()
  }

  return {
    merchant: {
      id: merchant.id,
      name: merchant.name,
      slug: merchant.slug,
    },
    domain: {
      hostname: domain.hostname,
      type: domain.type,
      is_primary: domain.is_primary,
    },
    sales_channel: {
      id: salesChannel.id,
      name: salesChannel.name,
    },
    publishable_api_key: apiKey.token,
  }
}

/**
 * Resolves staff tenancy from an authenticated actor. requestedMerchantId is
 * only a selector; active membership is the authorization proof.
 */
export async function resolveStaffMerchant(
  container: MedusaContainer,
  actorId: string,
  requestedMerchantId: string,
  options: ResolveStaffMerchantOptions = {}
): Promise<StaffMerchantContext> {
  const normalizedActorId = actorId?.trim()
  const normalizedMerchantId = requestedMerchantId?.trim()

  if (!normalizedActorId || !normalizedMerchantId) {
    throw staffMerchantNotFoundError()
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: memberData } = await query.graph({
    entity: "merchant_member",
    fields: [
      "id",
      "actor_id",
      "role",
      "status",
      "user.id",
      "merchant.id",
      "merchant.name",
      "merchant.slug",
      "merchant.status",
      "merchant.primary_sales_channel.id",
      "merchant.primary_sales_channel.name",
    ],
    filters: {
      actor_id: normalizedActorId,
      merchant_id: normalizedMerchantId,
      status: "active",
    },
  })
  const members = memberData as unknown as StaffMemberGraph[]
  const member = members.length === 1 ? members[0] : undefined
  const merchant = member?.merchant

  if (
    !member ||
    member.actor_id !== normalizedActorId ||
    member.status !== "active" ||
    member.user?.id !== normalizedActorId ||
    !merchant ||
    merchant.id !== normalizedMerchantId ||
    !merchant.primary_sales_channel
  ) {
    throw staffMerchantNotFoundError()
  }

  if (merchant.status !== "active") {
    throw new MedusaError(
      MedusaError.Types.FORBIDDEN,
      "Merchant is not active"
    )
  }

  if (!isMerchantMemberRole(member.role)) {
    throw new MedusaError(
      MedusaError.Types.FORBIDDEN,
      "Merchant member role is invalid"
    )
  }

  if (
    options.allowed_roles &&
    !options.allowed_roles.includes(member.role)
  ) {
    throw new MedusaError(
      MedusaError.Types.FORBIDDEN,
      "Merchant member does not have permission for this operation"
    )
  }

  return {
    merchant: {
      id: asResolvedMerchantId(merchant.id),
      name: merchant.name,
      slug: merchant.slug,
      status: "active",
    },
    salesChannel: {
      id: merchant.primary_sales_channel.id,
      name: merchant.primary_sales_channel.name,
    },
    member: {
      id: member.id,
      actor_id: member.actor_id,
      role: member.role,
      status: "active",
    },
  }
}

/**
 * Verifies ownership without revealing whether a cross-tenant record exists.
 * merchantId must come from resolveStoreMerchant or resolveStaffMerchant.
 */
export async function assertMerchantOwns(
  container: MedusaContainer,
  resourceType: MerchantOwnedResourceType,
  resourceId: string,
  merchantId: ResolvedMerchantId
): Promise<void> {
  if (!resourceId?.trim() || !merchantId) {
    throw ownedResourceNotFoundError(resourceType)
  }

  if (resourceType === "merchant") {
    if (resourceId !== merchantId) {
      throw ownedResourceNotFoundError(resourceType)
    }

    return
  }

  const merchantPath = ownershipPathByResourceType[resourceType]
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: resourceType,
    fields: ["id", `${merchantPath}.id`],
    filters: {
      id: resourceId,
    },
  })
  const record = (data as unknown as Array<Record<string, unknown>>)[0]
  const ownerId = readNestedId(record, merchantPath)

  if (!record || ownerId !== merchantId) {
    throw ownedResourceNotFoundError(resourceType)
  }
}

/**
 * Maps the promotion codes a shopper typed onto the merchant's own codes,
 * ignoring case (Medusa matches codes exactly). Another shop's code is
 * refused the same way as a code that doesn't exist.
 */
export async function resolveStorePromotionCodes(
  container: MedusaContainer,
  merchantId: ResolvedMerchantId,
  codes: readonly string[]
): Promise<string[]> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "merchant",
    fields: ["promotions.code"],
    filters: { id: merchantId },
  })
  const merchant = (data as unknown as Array<{
    promotions?: Array<{ code?: string | null }>
  }>)[0]
  const owned = new Map(
    (merchant?.promotions ?? []).flatMap(({ code }) =>
      code ? [[code.toUpperCase(), code] as const] : []
    )
  )

  return codes.map((code) => {
    const match = owned.get(code.trim().toUpperCase())

    if (!match) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `The promotion code ${code.trim()} is invalid`
      )
    }

    return match
  })
}

/**
 * Returns only products that satisfy both storefront invariants: merchant
 * ownership and availability in the merchant's primary sales channel.
 */
export async function listAccessibleStoreProductIds(
  container: MedusaContainer,
  storeContext: StoreMerchantContext,
  requestedIds?: readonly string[]
): Promise<string[]> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "merchant",
    fields: ["products.id", "products.sales_channels.id"],
    filters: {
      id: storeContext.merchant.id,
    },
  })
  const merchant = (data as unknown as MerchantCatalogGraph[])[0]
  const requested = requestedIds?.length
    ? new Set(requestedIds)
    : undefined

  return (merchant?.products ?? [])
    .filter((product) => {
      return (
        (!requested || requested.has(product.id)) &&
        product.sales_channels?.some(
          ({ id }) => id === storeContext.salesChannel.id
        )
      )
    })
    .map(({ id }) => id)
}

export async function listMerchantOwnedIds(
  container: MedusaContainer,
  merchantId: ResolvedMerchantId,
  resourceType: "product_category" | "product_collection"
): Promise<string[]> {
  const relation = resourceType === "product_category"
    ? "product_categories"
    : "product_collections"
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "merchant",
    fields: [`${relation}.id`],
    filters: { id: merchantId },
  })
  const merchant = (data as unknown as MerchantCatalogGraph[])[0]

  return (merchant?.[relation] ?? []).map(({ id }) => id)
}

export async function listAccessibleStoreProductOptionIds(
  container: MedusaContainer,
  storeContext: StoreMerchantContext
): Promise<string[]> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "merchant",
    fields: [
      "products.id",
      "products.sales_channels.id",
      "products.options.id",
    ],
    filters: { id: storeContext.merchant.id },
  })
  const merchant = (data as unknown as MerchantCatalogGraph[])[0]
  const optionIds = new Set<string>()

  for (const product of merchant?.products ?? []) {
    if (
      product.sales_channels?.some(
        ({ id }) => id === storeContext.salesChannel.id
      )
    ) {
      for (const option of product.options ?? []) {
        optionIds.add(option.id)
      }
    }
  }

  return Array.from(optionIds)
}

export async function listAccessibleStoreOrderIds(
  container: MedusaContainer,
  storeContext: StoreMerchantContext,
  customerId: string,
  requestedIds?: readonly string[]
): Promise<string[]> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "merchant",
    fields: ["orders.id", "orders.customer_id"],
    filters: { id: storeContext.merchant.id },
  })
  const merchant = (data as unknown as MerchantCatalogGraph[])[0]
  const requested = requestedIds?.length
    ? new Set(requestedIds)
    : undefined

  return (merchant?.orders ?? [])
    .filter(({ id, customer_id }) => {
      return (
        customer_id === customerId &&
        (!requested || requested.has(id))
      )
    })
    .map(({ id }) => id)
}

export async function assertStoreProductAccessible(
  container: MedusaContainer,
  productId: string,
  storeContext: StoreMerchantContext
): Promise<void> {
  const productIds = await listAccessibleStoreProductIds(
    container,
    storeContext,
    [productId]
  )

  if (productIds.length !== 1 || productIds[0] !== productId) {
    throw ownedResourceNotFoundError("product")
  }
}

export async function assertStoreVariantAccessible(
  container: MedusaContainer,
  variantId: string,
  storeContext: StoreMerchantContext
): Promise<void> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "product_variant",
    fields: [
      "id",
      "manage_inventory",
      "allow_backorder",
      "product.id",
      "inventory.id",
      "inventory.location_levels.location_id",
    ],
    filters: { id: variantId },
  })
  const variant = (data as unknown as ProductVariantGraph[])[0]

  if (!variant?.product?.id) {
    throw ownedResourceNotFoundError("product")
  }

  await assertStoreProductAccessible(
    container,
    variant.product.id,
    storeContext
  )

  if (!variant.manage_inventory) {
    return
  }

  const { data: merchantData } = await query.graph({
    entity: "merchant",
    fields: ["stock_locations.id"],
    filters: { id: storeContext.merchant.id },
  })
  const merchant = (merchantData as unknown as MerchantCatalogGraph[])[0]
  const ownedLocationIds = new Set(
    (merchant?.stock_locations ?? []).map(({ id }) => id)
  )
  const inventory = variant.inventory ?? []
  const locationIds = inventory.flatMap(({ location_levels }) => {
    return (location_levels ?? []).map(({ location_id }) => location_id)
  })

  if (
    inventory.length === 0 ||
    locationIds.some((locationId) => !ownedLocationIds.has(locationId)) ||
    (!variant.allow_backorder && locationIds.length === 0)
  ) {
    throw ownedResourceNotFoundError("product")
  }
}

export async function assertStoreCartAccessible(
  container: MedusaContainer,
  cartId: string,
  storeContext: StoreMerchantContext
): Promise<void> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "cart",
    fields: ["id", "sales_channel_id", "merchant.id"],
    filters: { id: cartId },
  })
  const cart = (data as unknown as CartGraph[])[0]

  if (
    !cart ||
    cart.sales_channel_id !== storeContext.salesChannel.id ||
    cart.merchant?.id !== storeContext.merchant.id
  ) {
    throw ownedResourceNotFoundError("cart")
  }
}

function asResolvedMerchantId(merchantId: string): ResolvedMerchantId {
  return merchantId as ResolvedMerchantId
}

function isMerchantMemberRole(role: string): role is MerchantMemberRole {
  return role === "owner" || role === "admin" || role === "staff"
}

function readNestedId(
  record: Record<string, unknown> | undefined,
  path: string
): string | undefined {
  let current: unknown = record

  for (const segment of path.split(".")) {
    if (!current || typeof current !== "object") {
      return undefined
    }

    current = (current as Record<string, unknown>)[segment]
  }

  if (!current || typeof current !== "object") {
    return undefined
  }

  const id = (current as Record<string, unknown>).id

  return typeof id === "string" ? id : undefined
}

function invalidHostnameError(): MedusaError {
  return new MedusaError(
    MedusaError.Types.INVALID_DATA,
    "Hostname is invalid"
  )
}

function storefrontNotFoundError(): MedusaError {
  return new MedusaError(
    MedusaError.Types.NOT_FOUND,
    "Storefront not found"
  )
}

function staffMerchantNotFoundError(): MedusaError {
  return new MedusaError(
    MedusaError.Types.NOT_FOUND,
    "Merchant membership not found"
  )
}

function ownedResourceNotFoundError(
  resourceType: MerchantOwnedResourceType
): MedusaError {
  return new MedusaError(
    MedusaError.Types.NOT_FOUND,
    `${resourceType} not found`
  )
}
