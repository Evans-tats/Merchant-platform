import "server-only"
import { cookies as nextCookies } from "next/headers"

import { getStorefrontTenant } from "@lib/tenant/context"
import { tenantCookieName } from "@lib/tenant/types"

async function currentTenantCookieName(baseName: string) {
  const tenant = await getStorefrontTenant()
  return tenantCookieName(baseName, tenant.merchant.id)
}

export const getAuthHeaders = async (): Promise<
  { authorization: string } | Record<string, never>
> => {
  try {
    const cookies = await nextCookies()
    const token = cookies.get(
      await currentTenantCookieName("_medusa_jwt")
    )?.value

    if (!token) {
      return {}
    }

    return { authorization: `Bearer ${token}` }
  } catch {
    return {}
  }
}

export const getCacheTag = async (tag: string): Promise<string> => {
  try {
    const tenant = await getStorefrontTenant()
    const cookies = await nextCookies()
    const baseTag = "merchant:" + tenant.merchant.id + ":" + tag
    const privateTags = new Set([
      "carts",
      "customers",
      "orders",
      "fulfillment",
      "shippingOptions",
    ])

    if (!privateTags.has(tag)) {
      return baseTag
    }

    const cacheId = cookies.get(
      await currentTenantCookieName("_medusa_cache_id")
    )?.value

    return cacheId ? baseTag + ":" + cacheId : ""
  } catch {
    return ""
  }
}

export const getCacheOptions = async (
  tag: string
): Promise<{ tags: string[] } | Record<string, never>> => {
  if (typeof window !== "undefined") {
    return {}
  }

  const cacheTag = await getCacheTag(tag)

  if (!cacheTag) {
    return {}
  }

  return { tags: [`${cacheTag}`] }
}

export const setAuthToken = async (token: string) => {
  const cookies = await nextCookies()
  cookies.set(await currentTenantCookieName("_medusa_jwt"), token, {
    maxAge: 60 * 60 * 24 * 7,
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
  })
}

export const removeAuthToken = async () => {
  const cookies = await nextCookies()
  cookies.set(await currentTenantCookieName("_medusa_jwt"), "", {
    maxAge: -1,
  })
}

export type PendingCustomer = {
  email: string
  first_name?: string
  last_name?: string
  phone?: string
}

// During the email verification flow the customer record isn't created until
// the customer verifies their email and logs in. We temporarily persist the
// extra signup fields in a cookie so they survive the customer leaving to open
// their inbox, and read them back when creating the customer at login.
export const setPendingCustomer = async (customer: PendingCustomer) => {
  const cookies = await nextCookies()
  cookies.set(
    await currentTenantCookieName("_medusa_pending_customer"),
    JSON.stringify(customer),
    {
      maxAge: 60 * 60 * 24,
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
    }
  )
}

export const getPendingCustomer = async (): Promise<PendingCustomer | null> => {
  const cookies = await nextCookies()
  const value = cookies.get(
    await currentTenantCookieName("_medusa_pending_customer")
  )?.value

  if (!value) {
    return null
  }

  try {
    return JSON.parse(value) as PendingCustomer
  } catch {
    return null
  }
}

export const removePendingCustomer = async () => {
  const cookies = await nextCookies()
  cookies.set(
    await currentTenantCookieName("_medusa_pending_customer"),
    "",
    {
      maxAge: -1,
    }
  )
}

export const getCartId = async () => {
  const cookies = await nextCookies()
  return cookies.get(
    await currentTenantCookieName("_medusa_cart_id")
  )?.value
}

export const setCartId = async (cartId: string) => {
  const cookies = await nextCookies()
  cookies.set(await currentTenantCookieName("_medusa_cart_id"), cartId, {
    maxAge: 60 * 60 * 24 * 7,
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
  })
}

export const removeCartId = async () => {
  const cookies = await nextCookies()
  cookies.set(await currentTenantCookieName("_medusa_cart_id"), "", {
    maxAge: -1,
  })
}
