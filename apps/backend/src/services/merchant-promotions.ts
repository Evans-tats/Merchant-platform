import { MedusaError } from "@medusajs/framework/utils"

/**
 * Merchant promotions and campaigns are Medusa's own, linked to the merchant
 * that made them. Medusa keeps promotion codes and campaign identifiers
 * unique across the platform, so codes are checked platform-wide and a
 * campaign's identifier carries its merchant's id.
 */

export const PROMOTION_CODE_MAX_LENGTH = 40
export const CAMPAIGN_NAME_MAX_LENGTH = 120
export const CAMPAIGN_DESCRIPTION_MAX_LENGTH = 500

const PROMOTION_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]*$/

// Medusa matches codes exactly, so codes are stored in capitals and the
// storefront guard maps what the shopper typed onto the stored code.
export function normalizePromotionCode(code: string): string {
  return code.trim().toUpperCase()
}

export function isValidPromotionCode(code: string): boolean {
  return (
    code.length >= 2 &&
    code.length <= PROMOTION_CODE_MAX_LENGTH &&
    PROMOTION_CODE_PATTERN.test(code)
  )
}

// A code another shop already uses, made the merchant's own. A long code is
// shortened so the shop's name still fits whole.
export function suggestPromotionCode(code: string, merchantSlug: string) {
  const suffix = merchantSlug
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .slice(0, 16)
    .replace(/^-+|-+$/g, "")

  return `${code.slice(0, PROMOTION_CODE_MAX_LENGTH - suffix.length - 1)}-${suffix}`
}

// Every merchant promotion carries this rule, so it only applies to carts in
// the merchant's own sales channel, code or automatic. Merchants never see
// or change it.
export const SHOP_RULE_ATTRIBUTE = "sales_channel_id"

export function shopRule(salesChannelId: string): MerchantPromotionRuleInput {
  return {
    attribute: SHOP_RULE_ATTRIBUTE,
    operator: "in",
    values: [salesChannelId],
  }
}

export type OwnedRuleResource =
  | "customer_group"
  | "product"
  | "product_category"
  | "product_collection"

// What a merchant's conditions can refer to, and which of the merchant's own
// records each attribute's values must be.
export const CUSTOMER_RULE_ATTRIBUTES: Record<string, OwnedRuleResource> = {
  "customer.groups.id": "customer_group",
}

export const ITEM_RULE_ATTRIBUTES: Record<string, OwnedRuleResource> = {
  "items.product.id": "product",
  "items.product.categories.id": "product_category",
  "items.product.collection_id": "product_collection",
}

export const MERCHANT_RULE_OPERATORS = ["in", "eq", "ne"] as const

export type MerchantRuleOperator = (typeof MERCHANT_RULE_OPERATORS)[number]

export type MerchantPromotionRuleInput = {
  attribute: string
  operator: MerchantRuleOperator
  values: string[]
}

export type MerchantPromotionStatus = "draft" | "active" | "inactive"

export type MerchantApplicationMethodInput = {
  type: "fixed" | "percentage"
  target_type: "items" | "order"
  allocation?: "each" | "across" | null
  value: number
  currency_code?: string | null
  max_quantity?: number | null
  buy_rules_min_quantity?: number | null
  apply_to_quantity?: number | null
}

export type MerchantCampaignBudgetInput = {
  type: "spend" | "usage"
  limit: number
  currency_code?: string | null
}

export type MerchantCampaignInput = {
  name: string
  description?: string | null
  starts_at?: string | null
  ends_at?: string | null
  budget?: MerchantCampaignBudgetInput | null
}

export type MerchantPromotionInput = {
  code: string
  type: "standard" | "buyget"
  status: MerchantPromotionStatus
  is_automatic: boolean
  limit?: number | null
  application_method: MerchantApplicationMethodInput
  rules?: MerchantPromotionRuleInput[]
  target_rules?: MerchantPromotionRuleInput[]
  buy_rules?: MerchantPromotionRuleInput[]
  campaign_id?: string | null
}

// The type, what it applies to and how it is spread are fixed once a
// promotion exists: Medusa rejects some of those changes on an update.
export type MerchantPromotionUpdate = Partial<
  Omit<MerchantPromotionInput, "type" | "application_method">
> & {
  application_method?: Partial<
    Omit<MerchantApplicationMethodInput, "type" | "target_type" | "allocation">
  >
}

export type NormalizedMerchantPromotion = {
  code: string
  type: "standard" | "buyget"
  status: MerchantPromotionStatus
  is_automatic: boolean
  limit: number | null
  application_method: {
    type: "fixed" | "percentage"
    target_type: "items" | "order"
    allocation: "each" | "across"
    value: number
    currency_code: string | null
    max_quantity: number | null
    buy_rules_min_quantity: number | null
    apply_to_quantity: number | null
  }
  rules: MerchantPromotionRuleInput[]
  target_rules: MerchantPromotionRuleInput[]
  buy_rules: MerchantPromotionRuleInput[]
  campaign_id: string | null
}

function invalid(message: string): MedusaError {
  return new MedusaError(MedusaError.Types.INVALID_DATA, message)
}

function positiveInteger(value: number | null | undefined) {
  return typeof value === "number" && Number.isInteger(value) && value >= 1
}

function normalizeRules(
  rules: MerchantPromotionRuleInput[] | undefined,
  allowed: Record<string, OwnedRuleResource>,
  label: string
): MerchantPromotionRuleInput[] {
  return (rules ?? []).map((rule) => {
    const values = Array.from(
      new Set(rule.values.map((value) => value.trim()).filter(Boolean))
    )

    if (!allowed[rule.attribute]) {
      throw invalid(`${label} can't use the condition ${rule.attribute}`)
    }

    if (!MERCHANT_RULE_OPERATORS.includes(rule.operator)) {
      throw invalid(`${label} can't use the operator ${rule.operator}`)
    }

    if (!values.length) {
      throw invalid(`Choose at least one value for each condition in ${label}`)
    }

    return { attribute: rule.attribute, operator: rule.operator, values }
  })
}

/**
 * Checks a promotion the way Medusa's promotion module would, but with
 * messages a merchant can act on, and fills in what follows from the type:
 * an order discount is spread across the order, a percentage off products
 * is spread across the matching items, and buy X get Y discounts exactly
 * the items it gives.
 */
export function normalizeMerchantPromotion(
  input: MerchantPromotionInput
): NormalizedMerchantPromotion {
  const code = normalizePromotionCode(input.code)

  if (!isValidPromotionCode(code)) {
    throw invalid(
      `Use 2 to ${PROMOTION_CODE_MAX_LENGTH} letters, numbers, dashes or underscores for the code`
    )
  }

  const method = input.application_method
  const value = Number(method.value)

  if (method.type === "percentage" && !(value > 0 && value <= 100)) {
    throw invalid("A percentage discount must be more than 0 and at most 100")
  }

  if (method.type === "fixed" && !(value > 0)) {
    throw invalid("The discount amount must be more than 0")
  }

  // Kept for percentages too: Medusa only lets a promotion into a campaign
  // with a spend budget when their currencies match.
  const currencyCode = method.currency_code?.trim().toLowerCase() || null

  if (method.type === "fixed" && !currencyCode) {
    throw invalid("Choose the currency of the discount amount")
  }

  if (input.limit != null && !positiveInteger(input.limit)) {
    throw invalid("The number of uses must be a whole number of at least 1")
  }

  const rules = normalizeRules(
    input.rules,
    CUSTOMER_RULE_ATTRIBUTES,
    "Who can use it"
  )
  const targetRules = normalizeRules(
    input.target_rules,
    ITEM_RULE_ATTRIBUTES,
    "Which items"
  )
  const buyRules = normalizeRules(
    input.buy_rules,
    ITEM_RULE_ATTRIBUTES,
    "What the customer buys"
  )
  const base = {
    code,
    type: input.type,
    status: input.status,
    is_automatic: input.is_automatic,
    limit: input.limit ?? null,
    rules,
    campaign_id: input.campaign_id ?? null,
  }

  if (input.type === "buyget") {
    if (method.type !== "percentage" || method.target_type !== "items") {
      throw invalid("Buy X get Y takes a percentage off items")
    }

    if (!positiveInteger(method.buy_rules_min_quantity)) {
      throw invalid("Say how many items the customer has to buy")
    }

    if (!positiveInteger(method.apply_to_quantity)) {
      throw invalid("Say how many items the customer gets")
    }

    if (!buyRules.length) {
      throw invalid("Choose the items the customer has to buy")
    }

    if (!targetRules.length) {
      throw invalid("Choose the items the customer gets")
    }

    return {
      ...base,
      application_method: {
        type: "percentage",
        target_type: "items",
        allocation: "each",
        value,
        currency_code: currencyCode,
        max_quantity: method.apply_to_quantity!,
        buy_rules_min_quantity: method.buy_rules_min_quantity!,
        apply_to_quantity: method.apply_to_quantity!,
      },
      target_rules: targetRules,
      buy_rules: buyRules,
    }
  }

  if (buyRules.length) {
    throw invalid("Only buy X get Y promotions have items to buy")
  }

  if (method.target_type === "order") {
    if (targetRules.length) {
      throw invalid("An order discount applies to the whole order, not chosen items")
    }

    return {
      ...base,
      application_method: {
        type: method.type,
        target_type: "order",
        allocation: "across",
        value,
        currency_code: currencyCode,
        max_quantity: null,
        buy_rules_min_quantity: null,
        apply_to_quantity: null,
      },
      target_rules: [],
      buy_rules: [],
    }
  }

  // A percentage is the same per item either way, so it is spread across
  // the items and needs no item limit. A fixed amount can come off each
  // item, up to a number of items, or be spread across them.
  const allocation =
    method.type === "percentage" ? "across" : method.allocation ?? "each"

  if (allocation === "each" && !positiveInteger(method.max_quantity)) {
    throw invalid("Say how many items in one order get the discount")
  }

  return {
    ...base,
    application_method: {
      type: method.type,
      target_type: "items",
      allocation,
      value,
      currency_code: currencyCode,
      max_quantity: allocation === "each" ? method.max_quantity! : null,
      buy_rules_min_quantity: null,
      apply_to_quantity: null,
    },
    target_rules: targetRules,
    buy_rules: [],
  }
}

type RuleValueGraph = { value?: string | null }

export type PromotionRuleGraph = {
  id: string
  attribute?: string | null
  operator?: string | null
  values?: RuleValueGraph[] | null
}

export type CampaignBudgetGraph = {
  id?: string
  type?: string | null
  limit?: number | string | null
  used?: number | string | null
  currency_code?: string | null
}

export type CampaignGraph = {
  id: string
  name?: string | null
  description?: string | null
  campaign_identifier?: string | null
  starts_at?: Date | string | null
  ends_at?: Date | string | null
  budget?: CampaignBudgetGraph | null
  promotions?: Array<{ id: string }> | null
  created_at?: Date | string | null
  updated_at?: Date | string | null
}

export type PromotionGraph = {
  id: string
  code?: string | null
  type?: string | null
  status?: string | null
  is_automatic?: boolean | null
  limit?: number | string | null
  used?: number | string | null
  application_method?: {
    type?: string | null
    target_type?: string | null
    allocation?: string | null
    value?: number | string | null
    currency_code?: string | null
    max_quantity?: number | string | null
    buy_rules_min_quantity?: number | string | null
    apply_to_quantity?: number | string | null
    target_rules?: PromotionRuleGraph[] | null
    buy_rules?: PromotionRuleGraph[] | null
  } | null
  rules?: PromotionRuleGraph[] | null
  campaign_id?: string | null
  campaign?: CampaignGraph | null
  created_at?: Date | string | null
  updated_at?: Date | string | null
}

function isoValue(value: Date | string | null | undefined): string | null {
  if (!value) {
    return null
  }

  const date = value instanceof Date ? value : new Date(value)

  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function numberOrNull(value: number | string | null | undefined) {
  return value === null || value === undefined || value === ""
    ? null
    : Number(value)
}

// The merchant's own conditions, without the hidden shop rule.
export function merchantRules(rules: PromotionRuleGraph[] | null | undefined) {
  return (rules ?? []).filter(
    ({ attribute }) => attribute && attribute !== SHOP_RULE_ATTRIBUTE
  )
}

function toRuleInput(rule: PromotionRuleGraph): MerchantPromotionRuleInput {
  return {
    attribute: rule.attribute ?? "",
    operator: (rule.operator ?? "in") as MerchantRuleOperator,
    values: (rule.values ?? [])
      .map(({ value }) => value ?? "")
      .filter(Boolean),
  }
}

// A stored promotion in the shape the merchant routes accept, so an update
// can be checked as a whole.
export function toMerchantPromotionInput(
  promotion: PromotionGraph
): MerchantPromotionInput {
  const method = promotion.application_method ?? {}

  return {
    code: promotion.code ?? "",
    type: promotion.type === "buyget" ? "buyget" : "standard",
    status: (promotion.status ?? "draft") as MerchantPromotionStatus,
    is_automatic: promotion.is_automatic === true,
    limit: numberOrNull(promotion.limit),
    application_method: {
      type: method.type === "fixed" ? "fixed" : "percentage",
      target_type: method.target_type === "order" ? "order" : "items",
      allocation: method.allocation === "each" ? "each" : "across",
      value: Number(method.value ?? 0),
      currency_code: method.currency_code ?? null,
      max_quantity: numberOrNull(method.max_quantity),
      buy_rules_min_quantity: numberOrNull(method.buy_rules_min_quantity),
      apply_to_quantity: numberOrNull(method.apply_to_quantity),
    },
    rules: merchantRules(promotion.rules).map(toRuleInput),
    target_rules: (method.target_rules ?? []).map(toRuleInput),
    buy_rules: (method.buy_rules ?? []).map(toRuleInput),
    campaign_id: promotion.campaign_id ?? promotion.campaign?.id ?? null,
  }
}

export function mergeMerchantPromotion(
  current: MerchantPromotionInput,
  update: MerchantPromotionUpdate
): MerchantPromotionInput {
  return {
    ...current,
    ...update,
    type: current.type,
    application_method: {
      ...current.application_method,
      ...update.application_method,
      type: current.application_method.type,
      target_type: current.application_method.target_type,
      allocation: current.application_method.allocation,
    },
  }
}

// The promotion as Medusa's create workflow takes it.
export function toCreatePromotionData(
  promotion: NormalizedMerchantPromotion,
  campaignId?: string | null
) {
  const { target_rules, buy_rules, ...method } = {
    ...promotion.application_method,
    target_rules: promotion.target_rules,
    buy_rules: promotion.buy_rules,
  }

  return {
    code: promotion.code,
    type: promotion.type,
    status: promotion.status,
    is_automatic: promotion.is_automatic,
    limit: promotion.limit,
    rules: promotion.rules,
    application_method: {
      ...method,
      currency_code: method.currency_code ?? undefined,
      target_rules,
      buy_rules,
    },
    campaign_id: campaignId ?? promotion.campaign_id ?? undefined,
  }
}

// The promotion as Medusa's update workflow takes it. Rules are replaced
// separately.
export function toUpdatePromotionData(
  id: string,
  promotion: NormalizedMerchantPromotion
) {
  return {
    id,
    code: promotion.code,
    status: promotion.status,
    is_automatic: promotion.is_automatic,
    limit: promotion.limit,
    campaign_id: promotion.campaign_id,
    application_method: {
      ...promotion.application_method,
      currency_code: promotion.application_method.currency_code ?? undefined,
    },
  }
}

export type MerchantRuleLabels = Map<string, string>

function toMerchantRule(
  rule: PromotionRuleGraph,
  labels: MerchantRuleLabels
) {
  const input = toRuleInput(rule)

  return {
    id: rule.id,
    attribute: input.attribute,
    operator: input.operator,
    values: input.values.map((value) => ({
      value,
      label: labels.get(value) ?? value,
    })),
  }
}

export type MerchantCampaignStatus = "scheduled" | "active" | "ended"

export function campaignStatus(
  campaign: Pick<CampaignGraph, "starts_at" | "ends_at">,
  now = new Date()
): MerchantCampaignStatus {
  const startsAt = isoValue(campaign.starts_at)
  const endsAt = isoValue(campaign.ends_at)
  const current = now.toISOString()

  if (startsAt && startsAt > current) {
    return "scheduled"
  }

  return endsAt && endsAt < current ? "ended" : "active"
}

export function normalizeCampaignName(name: string): string {
  return name.trim().replace(/\s+/g, " ")
}

export function campaignIdentifier(merchantId: string, name: string): string {
  return `${merchantId}:${normalizeCampaignName(name).toLowerCase()}`
}

function toCampaignBudget(budget: CampaignBudgetGraph | null | undefined) {
  if (!budget?.type) {
    return null
  }

  return {
    type: budget.type === "spend" ? ("spend" as const) : ("usage" as const),
    limit: numberOrNull(budget.limit),
    used: Number(budget.used ?? 0),
    currency_code: budget.currency_code ?? null,
  }
}

export function toMerchantCampaign(campaign: CampaignGraph, now = new Date()) {
  return {
    id: campaign.id,
    name: campaign.name ?? "",
    description: campaign.description ?? null,
    starts_at: isoValue(campaign.starts_at),
    ends_at: isoValue(campaign.ends_at),
    budget: toCampaignBudget(campaign.budget),
    promotion_count: campaign.promotions?.length ?? 0,
    status: campaignStatus(campaign, now),
    created_at: isoValue(campaign.created_at),
    updated_at: isoValue(campaign.updated_at),
  }
}

export type MerchantCampaign = ReturnType<typeof toMerchantCampaign>

export function toMerchantPromotion(
  promotion: PromotionGraph,
  labels: MerchantRuleLabels = new Map(),
  now = new Date()
) {
  const method = promotion.application_method ?? {}

  return {
    id: promotion.id,
    code: promotion.code ?? "",
    type: promotion.type === "buyget" ? ("buyget" as const) : ("standard" as const),
    status: (promotion.status ?? "draft") as MerchantPromotionStatus,
    is_automatic: promotion.is_automatic === true,
    limit: numberOrNull(promotion.limit),
    used: Number(promotion.used ?? 0),
    application_method: {
      type: method.type === "fixed" ? ("fixed" as const) : ("percentage" as const),
      target_type: method.target_type === "order" ? ("order" as const) : ("items" as const),
      allocation: method.allocation === "each" ? ("each" as const) : ("across" as const),
      value: Number(method.value ?? 0),
      currency_code: method.currency_code ?? null,
      max_quantity: numberOrNull(method.max_quantity),
      buy_rules_min_quantity: numberOrNull(method.buy_rules_min_quantity),
      apply_to_quantity: numberOrNull(method.apply_to_quantity),
    },
    rules: merchantRules(promotion.rules).map((rule) => toMerchantRule(rule, labels)),
    target_rules: (method.target_rules ?? []).map((rule) =>
      toMerchantRule(rule, labels)
    ),
    buy_rules: (method.buy_rules ?? []).map((rule) => toMerchantRule(rule, labels)),
    campaign: promotion.campaign
      ? toMerchantCampaign(promotion.campaign, now)
      : null,
    created_at: isoValue(promotion.created_at),
    updated_at: isoValue(promotion.updated_at),
  }
}

export type MerchantPromotion = ReturnType<typeof toMerchantPromotion>

// Promotions whose code or campaign name contains the search, newest first.
export function filterMerchantPromotions(
  promotions: MerchantPromotion[],
  input: { q?: string; status?: MerchantPromotionStatus }
) {
  const term = input.q?.trim().toLowerCase()

  return promotions
    .filter(
      (promotion) =>
        (!input.status || promotion.status === input.status) &&
        (!term ||
          [promotion.code, promotion.campaign?.name ?? ""]
            .join(" ")
            .toLowerCase()
            .includes(term))
    )
    .sort((left, right) =>
      (right.created_at ?? "").localeCompare(left.created_at ?? "")
    )
}

/**
 * Checks a campaign and fills in its identifier. A spend budget counts
 * money, so it needs a currency; a usage budget counts uses.
 */
export function normalizeMerchantCampaign(
  merchantId: string,
  input: MerchantCampaignInput
) {
  const name = normalizeCampaignName(input.name)

  if (!name) {
    throw invalid("Give the campaign a name")
  }

  const startsAt = input.starts_at ? new Date(input.starts_at) : null
  const endsAt = input.ends_at ? new Date(input.ends_at) : null

  if (
    (startsAt && Number.isNaN(startsAt.getTime())) ||
    (endsAt && Number.isNaN(endsAt.getTime()))
  ) {
    throw invalid("Use real dates for the campaign")
  }

  if (startsAt && endsAt && endsAt <= startsAt) {
    throw invalid("The campaign has to end after it starts")
  }

  const budget = input.budget ?? null

  if (budget?.type === "usage" && !positiveInteger(budget.limit)) {
    throw invalid("The number of uses must be a whole number of at least 1")
  }

  if (budget?.type === "spend" && !(budget.limit > 0)) {
    throw invalid("The spend limit must be more than 0")
  }

  const currencyCode = budget?.currency_code?.trim().toLowerCase() || null

  if (budget?.type === "spend" && !currencyCode) {
    throw invalid("Choose the currency of the spend budget")
  }

  return {
    name,
    description: input.description?.trim() || null,
    campaign_identifier: campaignIdentifier(merchantId, name),
    starts_at: startsAt,
    ends_at: endsAt,
    budget: budget
      ? {
          type: budget.type,
          limit: budget.limit,
          currency_code: budget.type === "spend" ? currencyCode : null,
        }
      : null,
  }
}

export type NormalizedMerchantCampaign = ReturnType<
  typeof normalizeMerchantCampaign
>

// A budget's type and currency are fixed once the campaign exists; its
// limit can change.
export type MerchantCampaignUpdate = Partial<
  Omit<MerchantCampaignInput, "budget">
> & {
  budget?: { limit: number }
}

export function mergeMerchantCampaign(
  current: CampaignGraph,
  update: MerchantCampaignUpdate
): MerchantCampaignInput {
  const budget = toCampaignBudget(current.budget)

  if (update.budget && !budget) {
    throw invalid("This campaign has no budget to change")
  }

  return {
    name: update.name ?? current.name ?? "",
    description:
      update.description === undefined
        ? current.description ?? null
        : update.description,
    starts_at:
      update.starts_at === undefined
        ? isoValue(current.starts_at)
        : update.starts_at,
    ends_at:
      update.ends_at === undefined ? isoValue(current.ends_at) : update.ends_at,
    budget: budget
      ? {
          type: budget.type,
          limit: update.budget?.limit ?? budget.limit ?? 0,
          currency_code: budget.currency_code,
        }
      : null,
  }
}
