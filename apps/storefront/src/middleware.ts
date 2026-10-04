import { HttpTypes } from "@medusajs/types"
import { NextRequest, NextResponse } from "next/server"

import {
  STOREFRONT_TENANT_COOKIES,
  STOREFRONT_TENANT_HEADERS,
  tenantCookieName,
  type StorefrontBootstrapConfiguration,
  type StorefrontTenant,
} from "@lib/tenant/types"

const BACKEND_URL = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL
const DEFAULT_REGION = process.env.NEXT_PUBLIC_DEFAULT_REGION || "ke"
const DEFAULT_STOREFRONT_HOSTNAME =
  process.env.STOREFRONT_DEFAULT_HOSTNAME
// For a deployment without a wildcard domain: every store shares this app's
// one address, ?shop=<store hostname> picks the store, and the hostname
// cookie keeps it for the rest of the visit.
const SHARED_HOST = process.env.STOREFRONT_SHARED_HOST === "true"
const SHOP_PARAM = "shop"

const regionMapCache = new Map<
  string,
  {
    regionMap: Map<string, HttpTypes.StoreRegion>
    updatedAt: number
  }
>()

function requestHostname(request: NextRequest): string {
  if (SHARED_HOST) {
    return (
      request.nextUrl.searchParams.get(SHOP_PARAM) ||
      request.cookies.get(STOREFRONT_TENANT_COOKIES.hostname)?.value ||
      DEFAULT_STOREFRONT_HOSTNAME ||
      ""
    )
      .trim()
      .toLowerCase()
  }

  const forwardedHost = request.headers
    .get("x-forwarded-host")
    ?.split(",")[0]
    .trim()
  const rawHost = forwardedHost || request.headers.get("host") || ""

  if (
    DEFAULT_STOREFRONT_HOSTNAME &&
    /^(localhost|127[.]0[.]0[.]1)(:[0-9]+)?$/i.test(rawHost)
  ) {
    return DEFAULT_STOREFRONT_HOSTNAME
  }

  try {
    return new URL("http://" + rawHost).hostname.toLowerCase()
  } catch {
    return ""
  }
}

async function resolveTenant(
  request: NextRequest
): Promise<StorefrontTenant> {
  if (!BACKEND_URL) {
    throw new Error("NEXT_PUBLIC_MEDUSA_BACKEND_URL is required")
  }

  const hostname = requestHostname(request)
  const response = await fetch(
    BACKEND_URL +
      "/storefront/configuration?hostname=" +
      encodeURIComponent(hostname),
    {
      method: "GET",
      cache: "no-store",
    }
  )

  if (!response.ok) {
    throw new Error(
      "Storefront resolver returned " + response.status
    )
  }

  const body = (await response.json()) as {
    configuration?: StorefrontBootstrapConfiguration
  }
  const configuration = body.configuration

  if (
    !configuration?.merchant.id ||
    !configuration.publishable_api_key ||
    configuration.domain.hostname !== hostname
  ) {
    throw new Error("Invalid storefront configuration")
  }

  return {
    merchant: configuration.merchant,
    hostname: configuration.domain.hostname,
    salesChannelId: configuration.sales_channel.id,
    publishableKey: configuration.publishable_api_key,
  }
}

async function getRegionMap(tenant: StorefrontTenant) {
  if (!BACKEND_URL) {
    throw new Error("NEXT_PUBLIC_MEDUSA_BACKEND_URL is required")
  }

  const cached = regionMapCache.get(tenant.merchant.id)

  if (
    !cached?.regionMap.keys().next().value ||
    cached.updatedAt < Date.now() - 3600 * 1000
  ) {
    const response = await fetch(BACKEND_URL + "/store/regions", {
      method: "GET",
      headers: {
        "x-publishable-api-key": tenant.publishableKey,
        "x-storefront-host": tenant.hostname,
      },
      next: {
        revalidate: 3600,
        tags: ["merchant:" + tenant.merchant.id + ":regions"],
      },
      cache: "force-cache",
    })

    if (!response.ok) {
      throw new Error("Backend returned " + response.status)
    }

    const json = (await response.json()) as {
      regions?: HttpTypes.StoreRegion[]
    }
    const regionMap = new Map<string, HttpTypes.StoreRegion>()

    for (const region of json.regions ?? []) {
      for (const country of region.countries ?? []) {
        regionMap.set(country.iso_2 ?? "", region)
      }
    }

    regionMapCache.set(tenant.merchant.id, {
      regionMap,
      updatedAt: Date.now(),
    })

    return regionMap
  }

  return cached.regionMap
}

async function getCountryCode(
  request: NextRequest,
  regionMap: Map<string, HttpTypes.StoreRegion | number>
) {
  let countryCode
  const urlCountryCode =
    request.nextUrl.pathname.split("/")[1]?.toLowerCase()
  const cloudflareCountryCode = (
    request as { cf?: { country?: string } }
  ).cf?.country?.toLowerCase()
  const vercelCountryCode = request.headers
    .get("x-vercel-ip-country")
    ?.toLowerCase()

  if (urlCountryCode && regionMap.has(urlCountryCode)) {
    countryCode = urlCountryCode
  } else if (
    cloudflareCountryCode &&
    regionMap.has(cloudflareCountryCode)
  ) {
    countryCode = cloudflareCountryCode
  } else if (
    vercelCountryCode &&
    regionMap.has(vercelCountryCode)
  ) {
    countryCode = vercelCountryCode
  } else if (regionMap.has(DEFAULT_REGION)) {
    countryCode = DEFAULT_REGION
  } else if (regionMap.keys().next().value) {
    countryCode = regionMap.keys().next().value
  }

  return countryCode
}

export async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.includes(".")) {
    return NextResponse.next()
  }

  let tenant: StorefrontTenant
  let regionMap: Map<string, HttpTypes.StoreRegion>

  try {
    tenant = await resolveTenant(request)
    regionMap = await getRegionMap(tenant)
  } catch {
    return new NextResponse("Storefront not found", { status: 404 })
  }

  const cacheCookieName = tenantCookieName(
    "_medusa_cache_id",
    tenant.merchant.id
  )
  const cacheIdCookie = request.cookies.get(cacheCookieName)
  const cacheId = cacheIdCookie?.value || crypto.randomUUID()
  const countryCode = await getCountryCode(request, regionMap)
  const country = countryCode || DEFAULT_REGION
  const firstPathSegment =
    request.nextUrl.pathname.split("/")[1]?.toLowerCase()
  const urlHasCountry = firstPathSegment === country.toLowerCase()
  const requestHeaders = new Headers(request.headers)

  requestHeaders.set(
    STOREFRONT_TENANT_HEADERS.merchantId,
    tenant.merchant.id
  )
  requestHeaders.set(
    STOREFRONT_TENANT_HEADERS.merchantName,
    encodeURIComponent(tenant.merchant.name)
  )
  requestHeaders.set(
    STOREFRONT_TENANT_HEADERS.merchantSlug,
    encodeURIComponent(tenant.merchant.slug)
  )
  requestHeaders.set(
    STOREFRONT_TENANT_HEADERS.hostname,
    tenant.hostname
  )
  requestHeaders.set(
    STOREFRONT_TENANT_HEADERS.salesChannelId,
    tenant.salesChannelId
  )
  requestHeaders.set(
    STOREFRONT_TENANT_HEADERS.publishableKey,
    tenant.publishableKey
  )

  if (urlHasCountry) {
    const response = NextResponse.next({
      request: { headers: requestHeaders },
    })
    setTenantCookies(response, tenant, cacheCookieName, cacheId)
    return response
  }

  const redirectPath =
    request.nextUrl.pathname === "/" ? "" : request.nextUrl.pathname
  const queryString = request.nextUrl.search || ""
  const redirectUrl =
    request.nextUrl.origin +
    "/" +
    country +
    redirectPath +
    queryString
  const response = NextResponse.redirect(redirectUrl, 307)
  setTenantCookies(response, tenant, cacheCookieName, cacheId)
  return response
}

function setTenantCookies(
  response: NextResponse,
  tenant: StorefrontTenant,
  cacheCookieName: string,
  cacheId: string
) {
  const options = {
    maxAge: 60 * 60 * 24,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  }

  response.cookies.set(cacheCookieName, cacheId, {
    ...options,
    httpOnly: true,
  })
  response.cookies.set(
    STOREFRONT_TENANT_COOKIES.merchantId,
    tenant.merchant.id,
    options
  )
  response.cookies.set(
    STOREFRONT_TENANT_COOKIES.merchantName,
    encodeURIComponent(tenant.merchant.name),
    options
  )
  response.cookies.set(
    STOREFRONT_TENANT_COOKIES.merchantSlug,
    encodeURIComponent(tenant.merchant.slug),
    options
  )
  response.cookies.set(
    STOREFRONT_TENANT_COOKIES.hostname,
    tenant.hostname,
    options
  )
  response.cookies.set(
    STOREFRONT_TENANT_COOKIES.salesChannelId,
    tenant.salesChannelId,
    options
  )
  response.cookies.set(
    STOREFRONT_TENANT_COOKIES.publishableKey,
    tenant.publishableKey,
    options
  )
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|images|assets|png|svg|jpg|jpeg|gif|webp).*)",
  ],
}
