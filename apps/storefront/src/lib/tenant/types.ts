export const STOREFRONT_TENANT_HEADERS = {
  merchantId: "x-storefront-merchant-id",
  merchantName: "x-storefront-merchant-name",
  merchantSlug: "x-storefront-merchant-slug",
  hostname: "x-storefront-host",
  salesChannelId: "x-storefront-sales-channel-id",
  publishableKey: "x-storefront-publishable-key",
} as const

export const STOREFRONT_TENANT_COOKIES = {
  merchantId: "_storefront_merchant_id",
  merchantName: "_storefront_merchant_name",
  merchantSlug: "_storefront_merchant_slug",
  hostname: "_storefront_hostname",
  salesChannelId: "_storefront_sales_channel_id",
  publishableKey: "_storefront_publishable_key",
} as const

export type StorefrontTenant = {
  merchant: {
    id: string
    name: string
    slug: string
  }
  hostname: string
  salesChannelId: string
  publishableKey: string
}

export type StorefrontBootstrapConfiguration = {
  merchant: StorefrontTenant["merchant"]
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

export function tenantCookieName(
  baseName: string,
  merchantId: string
): string {
  return (
    baseName +
    "_" +
    merchantId.replace(/[^a-zA-Z0-9_-]/g, "_")
  )
}
