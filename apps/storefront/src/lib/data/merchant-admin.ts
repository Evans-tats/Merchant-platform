"use server"

import { sdk } from "@lib/config"
import { getStorefrontTenant } from "@lib/tenant/context"
import { tenantCookieName } from "@lib/tenant/types"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"

const merchantAdminCookie = "_merchant_admin_jwt"

export type MerchantAdminDashboard = {
  id: string
  name: string
  slug: string
  status: string
  domains?: Array<Record<string, unknown>>
  members?: Array<
    Record<string, unknown> & {
      id: string
      role: string
      status: string
      user?: {
        email?: string
        first_name?: string
        last_name?: string
      }
    }
  >
  invitations?: Array<Record<string, unknown>>
  themes?: Array<Record<string, unknown>>
  payment_configs?: Array<Record<string, unknown>>
  products?: Array<Record<string, unknown>>
  stock_locations?: Array<Record<string, unknown>>
  orders?: Array<Record<string, unknown>>
  customer_profiles?: Array<Record<string, unknown>>
}

export type AddMerchantDomainState = {
  error: string | null
  verificationToken: string | null
  hostname: string | null
}

async function getMerchantAdminCookieName() {
  const tenant = await getStorefrontTenant()
  return tenantCookieName(merchantAdminCookie, tenant.merchant.id)
}

async function getMerchantAdminToken() {
  return (await cookies()).get(await getMerchantAdminCookieName())?.value
}

async function setMerchantAdminToken(token: string) {
  const cookieStore = await cookies()
  cookieStore.set(await getMerchantAdminCookieName(), token, {
    maxAge: 60 * 60 * 8,
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
  })
}

async function clearMerchantAdminToken() {
  const cookieStore = await cookies()
  cookieStore.set(await getMerchantAdminCookieName(), "", {
    maxAge: -1,
  })
}

function adminPath(countryCode: string) {
  return "/" + countryCode + "/merchant-admin"
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Request failed"
}

async function merchantAdminRequest<T>(
  path: string,
  init?: {
    method?: "GET" | "POST"
    body?: Record<string, unknown>
  }
): Promise<T> {
  const token = await getMerchantAdminToken()

  if (!token) {
    throw new Error("Merchant administrator authentication required")
  }

  return sdk.client.fetch<T>(path, {
    method: init?.method ?? "GET",
    body: init?.body,
    headers: {
      authorization: "Bearer " + token,
    },
    cache: "no-store",
  })
}

async function runMutation(
  countryCode: string,
  suffix: string,
  body: Record<string, unknown>
) {
  const tenant = await getStorefrontTenant()

  try {
    await merchantAdminRequest(
      "/admin/merchants/" + tenant.merchant.id + suffix,
      { method: "POST", body }
    )
  } catch (error) {
    return errorMessage(error)
  }

  revalidatePath(adminPath(countryCode))
  return null
}

function parseObject(value: FormDataEntryValue | null, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(label + " is required")
  }

  const parsed = JSON.parse(value) as unknown

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(label + " must be a JSON object")
  }

  return parsed as Record<string, unknown>
}

function redirectAfterMutation(
  countryCode: string,
  error: string | null,
  success: string
): never {
  const path = adminPath(countryCode)
  redirect(
    error
      ? path + "?error=" + encodeURIComponent(error)
      : path + "?success=" + encodeURIComponent(success)
  )
}

export async function retrieveMerchantAdminDashboard(): Promise<
  MerchantAdminDashboard | null
> {
  const tenant = await getStorefrontTenant()

  try {
    const { merchant } = await merchantAdminRequest<{
      merchant: MerchantAdminDashboard
    }>("/admin/merchants/" + tenant.merchant.id)

    return merchant
  } catch {
    return null
  }
}

export async function loginMerchantAdmin(
  countryCode: string,
  formData: FormData
) {
  const email = String(formData.get("email") ?? "")
  const password = String(formData.get("password") ?? "")
  let token: string

  try {
    const result = await sdk.auth.login("user", "emailpass", {
      email,
      password,
    })

    if (typeof result !== "string") {
      throw new Error("This login method requires an unsupported step")
    }

    token = result
  } catch {
    redirect(
      adminPath(countryCode) +
        "?error=" +
        encodeURIComponent("Invalid email or password")
    )
  }

  await setMerchantAdminToken(token)

  const dashboard = await retrieveMerchantAdminDashboard()

  if (!dashboard) {
    await clearMerchantAdminToken()
    redirect(
      adminPath(countryCode) +
        "?error=" +
        encodeURIComponent(
          "This user is not an active member of this merchant"
        )
    )
  }

  redirect(adminPath(countryCode))
}

export async function logoutMerchantAdmin(countryCode: string) {
  await clearMerchantAdminToken()
  redirect(adminPath(countryCode))
}

export async function updateMerchantDetails(
  countryCode: string,
  formData: FormData
) {
  const error = await runMutation(countryCode, "", {
    name: String(formData.get("name") ?? ""),
  })
  redirectAfterMutation(countryCode, error, "Merchant details updated")
}

export async function inviteMerchantMember(
  countryCode: string,
  formData: FormData
) {
  const error = await runMutation(countryCode, "/members", {
    email: String(formData.get("email") ?? ""),
    role: String(formData.get("role") ?? "staff"),
  })
  redirectAfterMutation(countryCode, error, "Staff invitation created")
}

export async function updateMerchantMember(
  countryCode: string,
  formData: FormData
) {
  const memberId = String(formData.get("member_id") ?? "")
  const error = await runMutation(
    countryCode,
    "/members/" + memberId,
    {
      role: String(formData.get("role") ?? "staff"),
      status: String(formData.get("status") ?? "active"),
    }
  )
  redirectAfterMutation(countryCode, error, "Member updated")
}

export async function publishMerchantTheme(
  countryCode: string,
  formData: FormData
) {
  let configuration: Record<string, unknown>

  try {
    configuration = parseObject(
      formData.get("configuration"),
      "Theme configuration"
    )
  } catch (error) {
    redirectAfterMutation(countryCode, errorMessage(error), "")
  }

  const error = await runMutation(countryCode, "/theme", {
    configuration,
  })
  redirectAfterMutation(countryCode, error, "Theme published")
}

export async function addMerchantDomain(
  countryCode: string,
  _state: AddMerchantDomainState,
  formData: FormData
): Promise<AddMerchantDomainState> {
  const tenant = await getStorefrontTenant()
  const hostname = String(formData.get("hostname") ?? "")

  try {
    const result = await merchantAdminRequest<{
      verification_token: string
    }>("/admin/merchants/" + tenant.merchant.id + "/domains", {
      method: "POST",
      body: { hostname },
    })
    revalidatePath(adminPath(countryCode))

    return {
      error: null,
      verificationToken: result.verification_token,
      hostname,
    }
  } catch (error) {
    return {
      error: errorMessage(error),
      verificationToken: null,
      hostname: null,
    }
  }
}

export async function verifyMerchantDomain(
  countryCode: string,
  formData: FormData
) {
  const domainId = String(formData.get("domain_id") ?? "")
  const error = await runMutation(
    countryCode,
    "/domains/" + domainId + "/verify",
    {}
  )
  redirectAfterMutation(countryCode, error, "Domain verified and activated")
}

export async function updateMerchantPayment(
  countryCode: string,
  formData: FormData
) {
  let publicConfiguration: Record<string, unknown>

  try {
    publicConfiguration = parseObject(
      formData.get("public_configuration"),
      "Public payment configuration"
    )
  } catch (error) {
    redirectAfterMutation(countryCode, errorMessage(error), "")
  }

  const secretReference = String(
    formData.get("secret_reference") ?? ""
  ).trim()
  const error = await runMutation(countryCode, "/payments", {
    provider: String(formData.get("provider") ?? "mpesa_stk"),
    mode: String(formData.get("mode") ?? "sandbox"),
    status: String(formData.get("status") ?? "disabled"),
    public_configuration: publicConfiguration,
    secret_reference: secretReference || null,
  })
  redirectAfterMutation(countryCode, error, "Payment configuration saved")
}

export async function createMerchantProducts(
  countryCode: string,
  formData: FormData
) {
  let products: unknown

  try {
    products = JSON.parse(String(formData.get("products") ?? ""))

    if (!Array.isArray(products) || !products.length) {
      throw new Error("Products must be a non-empty JSON array")
    }
  } catch (error) {
    redirectAfterMutation(countryCode, errorMessage(error), "")
  }

  const error = await runMutation(countryCode, "/products", {
    products,
  })
  redirectAfterMutation(countryCode, error, "Products created")
}

export async function adjustMerchantInventory(
  countryCode: string,
  formData: FormData
) {
  let adjustment: Record<string, unknown>

  try {
    adjustment = parseObject(
      formData.get("inventory"),
      "Inventory adjustment"
    )
  } catch (error) {
    redirectAfterMutation(countryCode, errorMessage(error), "")
  }

  const error = await runMutation(
    countryCode,
    "/inventory",
    adjustment
  )
  redirectAfterMutation(countryCode, error, "Inventory updated")
}

export async function cancelMerchantOrder(
  countryCode: string,
  formData: FormData
) {
  const orderId = String(formData.get("order_id") ?? "")
  const error = await runMutation(
    countryCode,
    "/orders/" + orderId + "/cancel",
    {}
  )
  redirectAfterMutation(countryCode, error, "Order cancelled")
}
