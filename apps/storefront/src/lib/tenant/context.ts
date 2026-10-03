import "server-only"

import { cookies, headers } from "next/headers"

import {
  STOREFRONT_TENANT_COOKIES,
  STOREFRONT_TENANT_HEADERS,
  type StorefrontTenant,
} from "./types"

function decodeHeader(value: string | null): string {
  if (!value) {
    return ""
  }

  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export async function getStorefrontTenant(): Promise<StorefrontTenant> {
  const requestHeaders = await headers()
  const requestCookies = await cookies()
  const read = (
    headerName: string,
    cookieName: string,
    encoded = false
  ) => {
    const value =
      requestHeaders.get(headerName) ??
      requestCookies.get(cookieName)?.value ??
      ""

    return encoded ? decodeHeader(value) : value
  }
  const tenant: StorefrontTenant = {
    merchant: {
      id: read(
        STOREFRONT_TENANT_HEADERS.merchantId,
        STOREFRONT_TENANT_COOKIES.merchantId
      ),
      name: read(
        STOREFRONT_TENANT_HEADERS.merchantName,
        STOREFRONT_TENANT_COOKIES.merchantName,
        true
      ),
      slug: read(
        STOREFRONT_TENANT_HEADERS.merchantSlug,
        STOREFRONT_TENANT_COOKIES.merchantSlug,
        true
      ),
    },
    hostname: read(
      STOREFRONT_TENANT_HEADERS.hostname,
      STOREFRONT_TENANT_COOKIES.hostname
    ),
    salesChannelId: read(
      STOREFRONT_TENANT_HEADERS.salesChannelId,
      STOREFRONT_TENANT_COOKIES.salesChannelId
    ),
    publishableKey: read(
      STOREFRONT_TENANT_HEADERS.publishableKey,
      STOREFRONT_TENANT_COOKIES.publishableKey
    ),
  }

  if (
    !tenant.merchant.id ||
    !tenant.merchant.name ||
    !tenant.hostname ||
    !tenant.salesChannelId ||
    !tenant.publishableKey
  ) {
    throw new Error("Storefront tenant context is unavailable")
  }

  return tenant
}

export async function getTenantMedusaHeaders() {
  const tenant = await getStorefrontTenant()

  return {
    "x-publishable-api-key": tenant.publishableKey,
    "x-storefront-host": tenant.hostname,
  }
}
