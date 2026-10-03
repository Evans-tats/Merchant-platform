import type {
  AuthenticatedMedusaRequest,
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
  MedusaStoreRequest,
} from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"

import {
  assertMerchantOwns,
  assertStoreCartAccessible,
  assertStoreProductAccessible,
  assertStoreVariantAccessible,
  listAccessibleStoreOrderIds,
  listAccessibleStoreProductOptionIds,
  listAccessibleStoreProductIds,
  listMerchantOwnedIds,
  resolveStaffMerchant,
  resolveStoreMerchant,
} from "../../services/tenant-resolution"
import {
  getStoreMerchantContext,
  setStaffMerchantContext,
  setStoreMerchantContext,
} from "../utils/merchant-request-context"

const platformAdministratorRole = "role_super_admin"

type UserRoleGraph = {
  rbac_roles?: Array<{ id: string }>
}

type CartCreateBody = {
  sales_channel_id?: string
  items?: Array<{ variant_id?: string }>
}

type AddLineItemBody = {
  variant_id?: string
}

type ShippingOptionCartBody = {
  cart_id?: string
}

export async function requirePlatformAdministrator(
  request: MedusaRequest,
  _response: MedusaResponse,
  next: MedusaNextFunction
): Promise<void> {
  const authContext = (request as AuthenticatedMedusaRequest).auth_context

  if (authContext?.actor_type === "api-key") {
    next()
    return
  }

  if (authContext?.actor_type !== "user" || !authContext.actor_id) {
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "Platform administrator authentication required"
    )
  }

  const query = request.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "user",
    fields: ["rbac_roles.id"],
    filters: { id: authContext.actor_id },
  })
  const user = (data as unknown as UserRoleGraph[])[0]
  const isPlatformAdministrator = user?.rbac_roles?.some(
    ({ id }) => id === platformAdministratorRole
  )

  if (!isPlatformAdministrator) {
    throw new MedusaError(
      MedusaError.Types.FORBIDDEN,
      "Platform administrator permission required"
    )
  }

  next()
}

export async function resolveStaffMerchantMiddleware(
  request: MedusaRequest,
  _response: MedusaResponse,
  next: MedusaNextFunction
): Promise<void> {
  const authContext = (request as AuthenticatedMedusaRequest).auth_context
  const context = await resolveStaffMerchant(
    request.scope,
    authContext?.actor_id,
    request.params.merchantId ?? pathSegmentAfter(request, "merchants")
  )

  setStaffMerchantContext(request, context)
  next()
}

export async function resolveStoreMerchantMiddleware(
  request: MedusaRequest,
  _response: MedusaResponse,
  next: MedusaNextFunction
): Promise<void> {
  const storeRequest = request as MedusaStoreRequest
  const context = await resolveStoreMerchant(
    request.scope,
    request.get("x-storefront-host") ?? request.get("host") ?? "",
    storeRequest.publishable_key_context?.key ?? ""
  )

  setStoreMerchantContext(request, context)
  next()
}

export async function scopeStoreProductList(
  request: MedusaRequest,
  _response: MedusaResponse,
  next: MedusaNextFunction
): Promise<void> {
  const context = getStoreMerchantContext(request)
  const requestedIds = readRequestedIds(request.filterableFields.id)
  const accessibleIds = await listAccessibleStoreProductIds(
    request.scope,
    context,
    requestedIds
  )

  request.filterableFields.id = accessibleIds
  next()
}

export async function assertStoreProductDetail(
  request: MedusaRequest,
  _response: MedusaResponse,
  next: MedusaNextFunction
): Promise<void> {
  await assertStoreProductAccessible(
    request.scope,
    request.params.id,
    getStoreMerchantContext(request)
  )
  next()
}

export async function scopeStoreProductOptionList(
  request: MedusaRequest,
  _response: MedusaResponse,
  next: MedusaNextFunction
): Promise<void> {
  const context = getStoreMerchantContext(request)
  const ownedIds = await listAccessibleStoreProductOptionIds(
    request.scope,
    context
  )
  const requestedIds = readRequestedIds(request.filterableFields.id)

  request.filterableFields.id = requestedIds?.length
    ? ownedIds.filter((id) => requestedIds.includes(id))
    : ownedIds
  next()
}

export async function scopeStoreOrderList(
  request: MedusaRequest,
  _response: MedusaResponse,
  next: MedusaNextFunction
): Promise<void> {
  const authContext = (request as AuthenticatedMedusaRequest).auth_context

  if (authContext?.actor_type !== "customer" || !authContext.actor_id) {
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "Customer authentication required"
    )
  }

  const context = getStoreMerchantContext(request)
  const requestedIds = readRequestedIds(request.filterableFields.id)
  request.filterableFields.id = await listAccessibleStoreOrderIds(
    request.scope,
    context,
    authContext.actor_id,
    requestedIds
  )
  next()
}

export function scopeStoreOwnedList(
  resourceType: "product_category" | "product_collection"
) {
  return async function scopeOwnedList(
    request: MedusaRequest,
    _response: MedusaResponse,
    next: MedusaNextFunction
  ): Promise<void> {
    const context = getStoreMerchantContext(request)
    const ownedIds = await listMerchantOwnedIds(
      request.scope,
      context.merchant.id,
      resourceType
    )
    const requestedIds = readRequestedIds(request.filterableFields.id)

    request.filterableFields.id = requestedIds?.length
      ? ownedIds.filter((id) => requestedIds.includes(id))
      : ownedIds
    next()
  }
}

export function assertStoreOwnedDetail(
  resourceType: "product_category" | "product_collection"
) {
  return async function assertOwnedDetail(
    request: MedusaRequest,
    _response: MedusaResponse,
    next: MedusaNextFunction
  ): Promise<void> {
    const context = getStoreMerchantContext(request)

    await assertMerchantOwns(
      request.scope,
      resourceType,
      request.params.id,
      context.merchant.id
    )
    next()
  }
}

export async function prepareStoreCartCreate(
  request: MedusaRequest,
  _response: MedusaResponse,
  next: MedusaNextFunction
): Promise<void> {
  const context = getStoreMerchantContext(request)
  const body = (request.validatedBody ?? {}) as CartCreateBody

  body.sales_channel_id = context.salesChannel.id

  for (const item of body.items ?? []) {
    if (!item.variant_id) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Cart item variant is required"
      )
    }

    await assertStoreVariantAccessible(
      request.scope,
      item.variant_id,
      context
    )
  }

  next()
}

export async function assertStoreCart(
  request: MedusaRequest,
  _response: MedusaResponse,
  next: MedusaNextFunction
): Promise<void> {
  const context = getStoreMerchantContext(request)
  const body = (request.validatedBody ?? {}) as CartCreateBody

  if (
    body.sales_channel_id &&
    body.sales_channel_id !== context.salesChannel.id
  ) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "Cart not found"
    )
  }

  await assertStoreCartAccessible(
    request.scope,
    request.params.id ?? pathSegmentAfter(request, "carts"),
    context
  )
  next()
}

export async function assertStoreOrder(
  request: MedusaRequest,
  _response: MedusaResponse,
  next: MedusaNextFunction
): Promise<void> {
  const authContext = (request as AuthenticatedMedusaRequest).auth_context
  const context = getStoreMerchantContext(request)
  const orderId =
    request.params.id ?? pathSegmentAfter(request, "orders")

  await assertMerchantOwns(
    request.scope,
    "order",
    orderId,
    context.merchant.id
  )

  if (!authContext?.actor_id) {
    next()
    return
  }

  if (authContext.actor_type !== "customer") {
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "Customer authentication required"
    )
  }

  const accessibleIds = await listAccessibleStoreOrderIds(
    request.scope,
    context,
    authContext.actor_id,
    [orderId]
  )

  if (!accessibleIds.includes(orderId)) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "Order not found"
    )
  }
  next()
}

function pathSegmentAfter(
  request: MedusaRequest,
  resourceSegment: string
): string {
  const path = (request.originalUrl || request.path).split("?")[0]
  const segments = path.split("/").filter(Boolean)
  const resourceIndex = segments.indexOf(resourceSegment)

  return resourceIndex >= 0 ? segments[resourceIndex + 1] ?? "" : ""
}

export async function assertStoreCartLineItemProduct(
  request: MedusaRequest,
  _response: MedusaResponse,
  next: MedusaNextFunction
): Promise<void> {
  const variantId = (request.validatedBody as AddLineItemBody).variant_id

  if (!variantId) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Cart item variant is required"
    )
  }

  await assertStoreVariantAccessible(
    request.scope,
    variantId,
    getStoreMerchantContext(request)
  )
  next()
}

export async function assertStoreShippingOptionsCart(
  request: MedusaRequest,
  _response: MedusaResponse,
  next: MedusaNextFunction
): Promise<void> {
  const queryCartId = request.query.cart_id
  const body = (request.validatedBody ?? {}) as ShippingOptionCartBody
  const cartId = typeof queryCartId === "string"
    ? queryCartId
    : body.cart_id

  if (!cartId) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Cart ID is required"
    )
  }

  await assertStoreCartAccessible(
    request.scope,
    cartId,
    getStoreMerchantContext(request)
  )
  next()
}

function readRequestedIds(value: unknown): string[] | undefined {
  if (typeof value === "string") {
    return [value]
  }

  if (Array.isArray(value)) {
    return value.filter((id): id is string => typeof id === "string")
  }

  return undefined
}
