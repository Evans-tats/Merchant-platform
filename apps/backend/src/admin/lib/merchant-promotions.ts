import { formatMoney } from "./format-money"
import type {
  MerchantCampaign,
  MerchantCampaignBudget,
  MerchantPromotion,
  MerchantPromotionRule,
} from "./merchant-api"

// How the dashboard describes, creates and edits merchant promotions. The
// five templates are Medusa's own; the routes check everything again.

export type PromotionTemplateId =
  | "percentage_off_products"
  | "amount_off_products"
  | "percentage_off_order"
  | "amount_off_order"
  | "buy_get"

export const PROMOTION_TEMPLATES: Array<{
  id: PromotionTemplateId
  label: string
  description: string
}> = [
  {
    id: "percentage_off_products",
    label: "Percentage off products",
    description: "For example, 10% off the Summer collection.",
  },
  {
    id: "amount_off_products",
    label: "Amount off products",
    description: "For example, KES 200 off each kikoi.",
  },
  {
    id: "percentage_off_order",
    label: "Percentage off the order",
    description: "For example, 5% off everything in the cart.",
  },
  {
    id: "amount_off_order",
    label: "Amount off the order",
    description: "For example, KES 500 off the whole order.",
  },
  {
    id: "buy_get",
    label: "Buy X get Y",
    description: "For example, buy 2 kikois and get 1 free.",
  },
]

const templateMethods: Record<
  PromotionTemplateId,
  {
    type: "standard" | "buyget"
    method: "fixed" | "percentage"
    target: "items" | "order"
  }
> = {
  percentage_off_products: { type: "standard", method: "percentage", target: "items" },
  amount_off_products: { type: "standard", method: "fixed", target: "items" },
  percentage_off_order: { type: "standard", method: "percentage", target: "order" },
  amount_off_order: { type: "standard", method: "fixed", target: "order" },
  buy_get: { type: "buyget", method: "percentage", target: "items" },
}

export function templateOf(promotion: MerchantPromotion): PromotionTemplateId {
  if (promotion.type === "buyget") {
    return "buy_get"
  }

  const { type, target_type } = promotion.application_method

  if (target_type === "order") {
    return type === "fixed" ? "amount_off_order" : "percentage_off_order"
  }

  return type === "fixed" ? "amount_off_products" : "percentage_off_products"
}

export function templateLabel(id: PromotionTemplateId) {
  return PROMOTION_TEMPLATES.find((template) => template.id === id)?.label ?? id
}

export type ItemScope = "all" | "products" | "collections" | "categories"

export const ITEM_SCOPE_ATTRIBUTES: Record<Exclude<ItemScope, "all">, string> = {
  products: "items.product.id",
  collections: "items.product.collection_id",
  categories: "items.product.categories.id",
}

const SEGMENT_ATTRIBUTE = "customer.groups.id"

const labelsOf = (rules: MerchantPromotionRule[]) =>
  rules.flatMap(({ values }) => values.map(({ label }) => label))

function money(amount: number, currencyCode: string | null) {
  return formatMoney(amount, currencyCode ?? undefined)
}

// What the discount is, in a few words: "10% off products".
export function describeDiscount(promotion: MerchantPromotion): string {
  const method = promotion.application_method

  if (promotion.type === "buyget") {
    const reward =
      method.value >= 100 ? "free" : `at ${method.value}% off`

    return `Buy ${method.buy_rules_min_quantity ?? 1}, get ${method.apply_to_quantity ?? 1} ${reward}`
  }

  const amount =
    method.type === "percentage"
      ? `${method.value}%`
      : money(method.value, method.currency_code)

  if (method.target_type === "order") {
    return `${amount} off the order`
  }

  return method.type === "fixed" && method.allocation === "each"
    ? `${amount} off each item`
    : `${amount} off products`
}

export function describeItems(rules: MerchantPromotionRule[], target: "items" | "order") {
  if (target === "order") {
    return "Whole order"
  }

  const labels = labelsOf(rules)

  return labels.length ? labels.join(", ") : "All products"
}

export function describeWho(promotion: MerchantPromotion) {
  const labels = labelsOf(
    promotion.rules.filter(({ attribute }) => attribute === SEGMENT_ATTRIBUTE)
  )

  return labels.length ? labels.join(", ") : "Everyone"
}

export function describeUses(promotion: MerchantPromotion) {
  return promotion.limit
    ? `${promotion.used} of ${promotion.limit} uses`
    : `${promotion.used} ${promotion.used === 1 ? "use" : "uses"}`
}

export function describeBudget(budget: MerchantCampaignBudget | null) {
  if (!budget) {
    return "No limit"
  }

  if (budget.type === "usage") {
    return budget.limit
      ? `${budget.used} of ${budget.limit} uses`
      : `${budget.used} uses`
  }

  return budget.limit
    ? `${money(budget.used, budget.currency_code)} of ${money(budget.limit, budget.currency_code)} given`
    : `${money(budget.used, budget.currency_code)} given`
}

// How much of the budget is used, 0 to 100, or null without a limit.
export function budgetPercent(budget: MerchantCampaignBudget | null) {
  if (!budget?.limit) {
    return null
  }

  return Math.min(100, Math.round((budget.used / budget.limit) * 100))
}

const dayFormat = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
})

export function describeCampaignDates(
  campaign: Pick<MerchantCampaign, "starts_at" | "ends_at">
) {
  const starts = campaign.starts_at ? dayFormat.format(new Date(campaign.starts_at)) : null
  const ends = campaign.ends_at ? dayFormat.format(new Date(campaign.ends_at)) : null

  if (starts && ends) return `${starts} – ${ends}`
  if (starts) return `From ${starts}`
  if (ends) return `Until ${ends}`
  return "No dates"
}

// A date input's value as the start or end of that day, local time.
export function dateInputToIso(value: string, edge: "start" | "end") {
  if (!value) {
    return null
  }

  const [year, month, day] = value.split("-").map(Number)
  const date =
    edge === "start"
      ? new Date(year, month - 1, day, 0, 0, 0, 0)
      : new Date(year, month - 1, day, 23, 59, 59, 999)

  return date.toISOString()
}

export function isoToDateInput(value: string | null) {
  if (!value) {
    return ""
  }

  const date = new Date(value)
  const pad = (part: number) => String(part).padStart(2, "0")

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export type ItemCondition = { scope: ItemScope; ids: string[] }

export type CampaignFormState = {
  name: string
  description: string
  starts_at: string
  ends_at: string
  budget_type: "none" | "usage" | "spend"
  budget_limit: string
}

export type PromotionFormState = {
  template: PromotionTemplateId
  code: string
  is_automatic: boolean
  status: "draft" | "active"
  value: string
  currency_code: string
  allocation: "each" | "across"
  max_quantity: string
  limit: string
  who: "everyone" | "segments"
  segment_ids: string[]
  items: ItemCondition
  buy_items: ItemCondition
  buy_quantity: string
  get_quantity: string
  campaign_mode: "none" | "existing" | "new"
  campaign_id: string
  campaign: CampaignFormState
}

export const emptyCampaignForm = (): CampaignFormState => ({
  name: "",
  description: "",
  starts_at: "",
  ends_at: "",
  budget_type: "none",
  budget_limit: "",
})

export function emptyPromotionForm(
  template: PromotionTemplateId,
  currencyCode: string
): PromotionFormState {
  const buyGet = template === "buy_get"

  return {
    template,
    code: "",
    is_automatic: false,
    status: "draft",
    value: buyGet ? "100" : "",
    currency_code: currencyCode,
    allocation: "each",
    max_quantity: "1",
    limit: "",
    who: "everyone",
    segment_ids: [],
    items: { scope: buyGet ? "products" : "all", ids: [] },
    buy_items: { scope: "products", ids: [] },
    buy_quantity: "2",
    get_quantity: "1",
    campaign_mode: "none",
    campaign_id: "",
    campaign: emptyCampaignForm(),
  }
}

function conditionFrom(rules: MerchantPromotionRule[]): ItemCondition {
  const rule = rules[0]
  const scope = (Object.keys(ITEM_SCOPE_ATTRIBUTES) as Array<Exclude<ItemScope, "all">>).find(
    (key) => ITEM_SCOPE_ATTRIBUTES[key] === rule?.attribute
  )

  return scope
    ? { scope, ids: rule.values.map(({ value }) => value) }
    : { scope: "all", ids: [] }
}

// The edit form's starting point.
export function promotionFormFrom(promotion: MerchantPromotion): PromotionFormState {
  const method = promotion.application_method
  const segmentIds = promotion.rules
    .filter(({ attribute }) => attribute === SEGMENT_ATTRIBUTE)
    .flatMap(({ values }) => values.map(({ value }) => value))

  return {
    ...emptyPromotionForm(templateOf(promotion), method.currency_code ?? "kes"),
    code: promotion.code,
    is_automatic: promotion.is_automatic,
    status: promotion.status === "active" ? "active" : "draft",
    value: String(method.value),
    allocation: method.allocation,
    max_quantity: method.max_quantity ? String(method.max_quantity) : "1",
    limit: promotion.limit ? String(promotion.limit) : "",
    who: segmentIds.length ? "segments" : "everyone",
    segment_ids: segmentIds,
    items: conditionFrom(promotion.target_rules),
    buy_items: conditionFrom(promotion.buy_rules),
    buy_quantity: String(method.buy_rules_min_quantity ?? 2),
    get_quantity: String(method.apply_to_quantity ?? 1),
    campaign_mode: promotion.campaign ? "existing" : "none",
    campaign_id: promotion.campaign?.id ?? "",
  }
}

const toNumber = (value: string) => {
  const number = Number(value.trim())

  return value.trim() && Number.isFinite(number) ? number : null
}

const conditionRules = (condition: ItemCondition) =>
  condition.scope === "all" || !condition.ids.length
    ? []
    : [
        {
          attribute: ITEM_SCOPE_ATTRIBUTES[condition.scope],
          operator: "in" as const,
          values: condition.ids,
        },
      ]

const segmentRules = (form: PromotionFormState) =>
  form.who === "segments" && form.segment_ids.length
    ? [{ attribute: SEGMENT_ATTRIBUTE, operator: "in" as const, values: form.segment_ids }]
    : []

// Why the form can't be sent yet, or null when it can.
export function promotionFormProblem(
  form: PromotionFormState,
  step: "details" | "campaign" = "campaign"
): string | null {
  const method = templateMethods[form.template]
  const value = toNumber(form.value)

  if (!form.code.trim()) return "Add a code"
  if (value === null || value <= 0) return "Add the discount"
  if (method.method === "percentage" && value > 100) {
    return "A percentage can be at most 100"
  }
  if (
    method.method === "fixed" &&
    method.target === "items" &&
    form.allocation === "each" &&
    !(toNumber(form.max_quantity)! >= 1)
  ) {
    return "Say how many items get the discount"
  }
  if (form.limit.trim() && !(toNumber(form.limit)! >= 1)) {
    return "The number of uses must be at least 1"
  }
  if (form.who === "segments" && !form.segment_ids.length) {
    return "Choose at least one customer segment"
  }
  if (
    method.type === "standard" &&
    method.target === "items" &&
    form.items.scope !== "all" &&
    !form.items.ids.length
  ) {
    return "Choose the items it applies to"
  }
  if (method.type === "buyget") {
    if (!(toNumber(form.buy_quantity)! >= 1) || !(toNumber(form.get_quantity)! >= 1)) {
      return "Say how many items the customer buys and gets"
    }
    if (!form.buy_items.ids.length || !form.items.ids.length) {
      return "Choose the items the customer buys and gets"
    }
  }

  if (step === "details") return null

  if (form.campaign_mode === "existing" && !form.campaign_id) {
    return "Choose a campaign"
  }
  if (form.campaign_mode === "new") {
    return campaignFormProblem(form.campaign)
  }

  return null
}

export function campaignFormProblem(campaign: CampaignFormState): string | null {
  if (!campaign.name.trim()) return "Give the campaign a name"
  if (campaign.starts_at && campaign.ends_at && campaign.ends_at < campaign.starts_at) {
    return "The campaign has to end after it starts"
  }
  if (campaign.budget_type !== "none" && !(toNumber(campaign.budget_limit)! > 0)) {
    return "Add the budget limit"
  }

  return null
}

export function campaignFormFrom(campaign: MerchantCampaign): CampaignFormState {
  return {
    name: campaign.name,
    description: campaign.description ?? "",
    starts_at: isoToDateInput(campaign.starts_at),
    ends_at: isoToDateInput(campaign.ends_at),
    budget_type: campaign.budget?.type ?? "none",
    budget_limit: campaign.budget?.limit ? String(campaign.budget.limit) : "",
  }
}

// What can change once a campaign exists: a budget keeps its type.
export function campaignUpdatePayload(
  form: CampaignFormState,
  campaign: MerchantCampaign
) {
  const { name, description, starts_at, ends_at } = campaignPayload(form, "")

  return {
    name,
    description,
    starts_at,
    ends_at,
    ...(campaign.budget
      ? { budget: { limit: toNumber(form.budget_limit) ?? 0 } }
      : {}),
  }
}

export function campaignPayload(campaign: CampaignFormState, currencyCode: string) {
  return {
    name: campaign.name.trim(),
    description: campaign.description.trim() || null,
    starts_at: dateInputToIso(campaign.starts_at, "start"),
    ends_at: dateInputToIso(campaign.ends_at, "end"),
    budget:
      campaign.budget_type === "none"
        ? null
        : {
            type: campaign.budget_type,
            limit: toNumber(campaign.budget_limit) ?? 0,
            currency_code: campaign.budget_type === "spend" ? currencyCode : null,
          },
  }
}

// The create request for the promotion routes.
export function promotionPayload(form: PromotionFormState) {
  const method = templateMethods[form.template]
  const buyGet = method.type === "buyget"
  const eachItem =
    method.method === "fixed" && method.target === "items" && form.allocation === "each"

  return {
    code: form.code.trim(),
    type: method.type,
    status: form.status,
    is_automatic: form.is_automatic,
    limit: toNumber(form.limit),
    application_method: {
      type: method.method,
      target_type: method.target,
      allocation: method.target === "items" && method.method === "fixed" ? form.allocation : null,
      value: toNumber(form.value) ?? 0,
      currency_code: form.currency_code || null,
      max_quantity: eachItem ? toNumber(form.max_quantity) : null,
      buy_rules_min_quantity: buyGet ? toNumber(form.buy_quantity) : null,
      apply_to_quantity: buyGet ? toNumber(form.get_quantity) : null,
    },
    rules: segmentRules(form),
    target_rules: method.target === "items" ? conditionRules(form.items) : [],
    buy_rules: buyGet ? conditionRules(form.buy_items) : [],
    ...(form.campaign_mode === "existing" && form.campaign_id
      ? { campaign_id: form.campaign_id }
      : {}),
    ...(form.campaign_mode === "new"
      ? { campaign: campaignPayload(form.campaign, form.currency_code) }
      : {}),
  }
}

// The update request: what can change once a promotion exists.
export function promotionUpdatePayload(form: PromotionFormState) {
  const { code, is_automatic, limit, application_method, rules, target_rules, buy_rules } =
    promotionPayload(form)
  const method = templateMethods[form.template]

  return {
    code,
    is_automatic,
    limit,
    application_method: {
      value: application_method.value,
      currency_code: application_method.currency_code,
      max_quantity: application_method.max_quantity,
      buy_rules_min_quantity: application_method.buy_rules_min_quantity,
      apply_to_quantity: application_method.apply_to_quantity,
    },
    rules,
    ...(method.target === "items" ? { target_rules } : {}),
    ...(method.type === "buyget" ? { buy_rules } : {}),
    campaign_id: form.campaign_mode === "existing" ? form.campaign_id || null : null,
  }
}

export const PROMOTION_STATUS_BADGES: Record<
  MerchantPromotion["status"],
  { label: string; color: "green" | "grey" | "orange" }
> = {
  active: { label: "Active", color: "green" },
  draft: { label: "Draft", color: "grey" },
  inactive: { label: "Inactive", color: "orange" },
}

export const CAMPAIGN_STATUS_BADGES: Record<
  MerchantCampaign["status"],
  { label: string; color: "green" | "blue" | "grey" }
> = {
  active: { label: "Active", color: "green" },
  scheduled: { label: "Scheduled", color: "blue" },
  ended: { label: "Ended", color: "grey" },
}
