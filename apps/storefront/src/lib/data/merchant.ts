"use server"

import { sdk } from "@lib/config"

export type MerchantBranding = {
  name?: string
  logo_url?: string
  primary_color?: string
  accent_color?: string
  description?: string
}

export type MerchantTheme = {
  id: string
  version: number
  is_active: boolean
  configuration?: {
    branding?: MerchantBranding
    pages?: unknown
  }
}

export type MerchantPage = {
  slug: string
  title: string
  content?: string
  navigation_label?: string
  show_in_navigation?: boolean
}

export type StorefrontMerchant = {
  id: string
  name: string
  slug: string
  status: "active"
  themes?: MerchantTheme[]
}

export async function retrieveMerchantConfiguration() {
  return sdk.client
    .fetch<{ merchant: StorefrontMerchant }>("/store/merchant", {
      method: "GET",
      cache: "no-store",
    })
    .then(({ merchant }) => merchant)
}

export async function retrieveMerchantTheme() {
  return sdk.client
    .fetch<{ theme: MerchantTheme | null }>("/store/merchant/theme", {
      method: "GET",
      cache: "no-store",
    })
    .then(({ theme }) => theme)
}

export async function listMerchantPages(): Promise<MerchantPage[]> {
  const { pages } = await sdk.client.fetch<{ pages: unknown }>(
    "/store/merchant/pages",
    {
      method: "GET",
      cache: "no-store",
    }
  )

  if (Array.isArray(pages)) {
    return pages.filter(isMerchantPage)
  }

  if (pages && typeof pages === "object") {
    return Object.entries(pages).flatMap(([slug, value]) => {
      if (!value || typeof value !== "object") {
        return []
      }

      const page = { slug, ...value }
      return isMerchantPage(page) ? [page] : []
    })
  }

  return []
}

function isMerchantPage(value: unknown): value is MerchantPage {
  if (!value || typeof value !== "object") {
    return false
  }

  const page = value as Record<string, unknown>
  return (
    typeof page.slug === "string" &&
    typeof page.title === "string" &&
    (page.content === undefined || typeof page.content === "string")
  )
}
