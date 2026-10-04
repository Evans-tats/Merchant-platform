export type MpesaAccountType = "till" | "paybill" | "pochi"
export type OnboardingLanguage = "en" | "sw"
export type OnboardingChannel = "cli" | "whatsapp" | "business_hub"
export type OnboardingStep =
  | "language"
  | "terms"
  | "account_type"
  | "account_number"
  | "otp"
  | "store_name"
  | "category"
  | "products"
  | "review"
  | "completed"

export const STORE_CATEGORIES = [
  "groceries",
  "fashion",
  "electronics",
  "beauty",
  "food",
  "other",
] as const

export type StoreCategory = (typeof STORE_CATEGORIES)[number]

export type OnboardingProduct = {
  title: string
  price: number
}

export type OnboardingAnswers = {
  selected_account_type?: MpesaAccountType
  store_name?: string
  category?: StoreCategory
  products?: OnboardingProduct[]
}

export const MAX_ONBOARDING_PRODUCTS = 5

// Steps that can only be reached after the ownership code was confirmed.
export const VERIFIED_STEPS: OnboardingStep[] = [
  "store_name",
  "category",
  "products",
  "review",
]

const YES = new Set(["yes", "y", "ndio", "ndiyo", "sawa", "ok"])
const NO = new Set(["no", "n", "hapana", "la"])

export const isYes = (value: string) => YES.has(value.trim().toLowerCase())
export const isNo = (value: string) => NO.has(value.trim().toLowerCase())

// Accepts 07XXXXXXXX, 01XXXXXXXX, 2547XXXXXXXX, and +2547XXXXXXXX.
export function normalizeMsisdn(value: string): string | null {
  const match = /^(?:\+?254|0)?([17]\d{8})$/.exec(value.replace(/[\s-]/g, ""))

  return match ? `254${match[1]}` : null
}

export function maskMsisdn(msisdn: string): string {
  const local = `0${msisdn.slice(3)}`

  return `${local.slice(0, 4)}***${local.slice(-3)}`
}

export function parseAccountNumber(value: string): string | null {
  const digits = value.replace(/\s/g, "")

  return /^\d{5,7}$/.test(digits) ? digits : null
}

export function parseMenuChoice(value: string, optionCount: number) {
  const choice = Number(value.trim())

  return Number.isInteger(choice) && choice >= 1 && choice <= optionCount
    ? choice
    : null
}

// "Unga 2kg, 250" / "Sukuma wiki @ 30" / "Shoes - KES 1,500"
export function parseProductLine(value: string): OnboardingProduct | null {
  const match =
    /^(.+?)\s*(?:,|:|@|\s-\s|\sat\s)\s*(?:kes|kshs?)?\.?\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?\s*(?:\/-|bob|kes|kshs?|shillings?)?\s*$/i
      .exec(value.trim())

  if (!match) {
    return null
  }

  const title = match[1].trim()
  const price = Number(`${match[2].replace(/,/g, "")}.${match[3] ?? "0"}`)

  if (title.length < 2 || title.length > 120) {
    return null
  }

  if (!Number.isFinite(price) || price <= 0 || price > 10_000_000) {
    return null
  }

  return { title, price }
}

export function parseStoreName(value: string): string | null {
  const name = value.trim().replace(/\s+/g, " ")

  return name.length >= 2 && name.length <= 60 ? name : null
}

export function toTitleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b([a-z])/g, (letter) => letter.toUpperCase())
}

export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40)
    .replace(/-$/, "")
}

// Subdomains of MERCHANT_PLATFORM_DOMAIN the platform serves itself (the
// backend runs at api.<domain>), so no store may be published on them.
const RESERVED_STORE_SLUGS = new Set(["api", "admin", "app", "www"])

export function isReservedStoreSlug(slug: string): boolean {
  return RESERVED_STORE_SLUGS.has(slug)
}
