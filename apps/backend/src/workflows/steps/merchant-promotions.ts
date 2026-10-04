import type { MedusaContainer } from "@medusajs/framework"
import type { IPromotionModuleService } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils"
import {
  createStep,
  StepResponse,
} from "@medusajs/framework/workflows-sdk"

import {
  toMerchantCustomerSegment,
  type MerchantSegmentGroupSource,
} from "../../services/merchant-customer-segments"
import {
  CUSTOMER_RULE_ATTRIBUTES,
  filterMerchantPromotions,
  ITEM_RULE_ATTRIBUTES,
  mergeMerchantCampaign,
  mergeMerchantPromotion,
  merchantRules,
  normalizeMerchantCampaign,
  normalizeMerchantPromotion,
  shopRule,
  suggestPromotionCode,
  toMerchantCampaign,
  toMerchantPromotion,
  toMerchantPromotionInput,
  type CampaignGraph,
  type MerchantCampaignInput,
  type MerchantCampaignUpdate,
  type MerchantPromotionInput,
  type MerchantPromotionRuleInput,
  type MerchantPromotionStatus,
  type MerchantPromotionUpdate,
  type MerchantRuleLabels,
  type NormalizedMerchantCampaign,
  type OwnedRuleResource,
  type PromotionGraph,
} from "../../services/merchant-promotions"
import {
  assertMerchantOwns,
  listMerchantOwnedIds,
  type ResolvedMerchantId,
} from "../../services/tenant-resolution"

const ruleFields = (path: string) => [
  `${path}.id`,
  `${path}.attribute`,
  `${path}.operator`,
  `${path}.values.value`,
]

const campaignFields = (path?: string) =>
  [
    "id",
    "name",
    "description",
    "starts_at",
    "ends_at",
    "created_at",
    "updated_at",
    "budget.type",
    "budget.limit",
    "budget.used",
    "budget.currency_code",
  ].map((field) => (path ? `${path}.${field}` : field))

const promotionFields = [
  "id",
  "code",
  "type",
  "status",
  "is_automatic",
  "limit",
  "used",
  "campaign_id",
  "created_at",
  "updated_at",
  "application_method.type",
  "application_method.target_type",
  "application_method.allocation",
  "application_method.value",
  "application_method.currency_code",
  "application_method.max_quantity",
  "application_method.buy_rules_min_quantity",
  "application_method.apply_to_quantity",
  ...ruleFields("rules"),
  ...ruleFields("application_method.target_rules"),
  ...ruleFields("application_method.buy_rules"),
  ...campaignFields("campaign"),
]

const resourceNouns: Record<OwnedRuleResource, string> = {
  customer_group: "customer segments",
  product: "products",
  product_category: "categories",
  product_collection: "collections",
}

function invalid(message: string): MedusaError {
  return new MedusaError(MedusaError.Types.INVALID_DATA, message)
}

/** The currencies the platform sells in, from its regions. */
export async function listPlatformCurrencyCodes(
  container: MedusaContainer
): Promise<string[]> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "region",
    fields: ["currency_code"],
  })

  return Array.from(
    new Set(
      (data as unknown as Array<{ currency_code: string }>).map(
        ({ currency_code }) => currency_code.toLowerCase()
      )
    )
  ).sort()
}

async function listMerchantLinkedIds(
  container: MedusaContainer,
  merchantId: ResolvedMerchantId,
  relation: "promotions" | "campaigns"
): Promise<string[]> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "merchant",
    fields: [`${relation}.id`],
    filters: { id: merchantId },
  })
  const merchant = (data as unknown as Array<
    Record<string, Array<{ id: string }> | undefined>
  >)[0]

  return (merchant?.[relation] ?? []).map(({ id }) => id)
}

async function queryPromotions(
  container: MedusaContainer,
  ids: string[]
): Promise<PromotionGraph[]> {
  if (!ids.length) {
    return []
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "promotion",
    fields: promotionFields,
    filters: { id: ids },
  })

  return data as unknown as PromotionGraph[]
}

async function queryCampaigns(
  container: MedusaContainer,
  ids: string[]
): Promise<CampaignGraph[]> {
  if (!ids.length) {
    return []
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "campaign",
    fields: [...campaignFields(), "campaign_identifier", "promotions.id"],
    filters: { id: ids },
  })

  return data as unknown as CampaignGraph[]
}

function ruleResource(attribute: string): OwnedRuleResource | undefined {
  return CUSTOMER_RULE_ATTRIBUTES[attribute] ?? ITEM_RULE_ATTRIBUTES[attribute]
}

function idsByResource(rules: Array<{ attribute?: string | null; values: string[] }>) {
  const ids = new Map<OwnedRuleResource, Set<string>>()

  for (const rule of rules) {
    const resource = rule.attribute ? ruleResource(rule.attribute) : undefined

    if (resource) {
      const set = ids.get(resource) ?? new Set<string>()
      rule.values.forEach((value) => set.add(value))
      ids.set(resource, set)
    }
  }

  return ids
}

const labelLookups: Record<
  OwnedRuleResource,
  { entity: string; fields: string[]; label: (row: Record<string, unknown>) => string }
> = {
  customer_group: {
    entity: "customer_group",
    fields: ["id", "name", "metadata"],
    label: (row) =>
      toMerchantCustomerSegment(row as unknown as MerchantSegmentGroupSource).name,
  },
  product: {
    entity: "product",
    fields: ["id", "title"],
    label: (row) => String(row.title ?? ""),
  },
  product_category: {
    entity: "product_category",
    fields: ["id", "name"],
    label: (row) => String(row.name ?? ""),
  },
  product_collection: {
    entity: "product_collection",
    fields: ["id", "title"],
    label: (row) => String(row.title ?? ""),
  },
}

// Names for the segments, products, categories and collections the
// promotions' conditions refer to.
async function ruleLabels(
  container: MedusaContainer,
  promotions: PromotionGraph[]
): Promise<MerchantRuleLabels> {
  const rules = promotions.flatMap((promotion) =>
    [
      ...merchantRules(promotion.rules),
      ...(promotion.application_method?.target_rules ?? []),
      ...(promotion.application_method?.buy_rules ?? []),
    ].map((rule) => ({
      attribute: rule.attribute,
      values: (rule.values ?? []).map(({ value }) => value ?? ""),
    }))
  )
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const labels: MerchantRuleLabels = new Map()

  await Promise.all(
    Array.from(idsByResource(rules)).map(async ([resource, ids]) => {
      const lookup = labelLookups[resource]
      const { data } = await query.graph({
        entity: lookup.entity,
        fields: lookup.fields,
        filters: { id: Array.from(ids) },
      })

      for (const row of data as unknown as Array<Record<string, unknown>>) {
        labels.set(String(row.id), lookup.label(row))
      }
    })
  )

  return labels
}

async function listMerchantResourceIds(
  container: MedusaContainer,
  merchantId: ResolvedMerchantId,
  resource: OwnedRuleResource
): Promise<Set<string>> {
  if (resource === "product_category" || resource === "product_collection") {
    return new Set(await listMerchantOwnedIds(container, merchantId, resource))
  }

  const relation = resource === "product" ? "products" : "customer_groups"
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "merchant",
    fields: [`${relation}.id`],
    filters: { id: merchantId },
  })
  const merchant = (data as unknown as Array<
    Record<string, Array<{ id: string }> | undefined>
  >)[0]

  return new Set((merchant?.[relation] ?? []).map(({ id }) => id))
}

// Conditions may only name the merchant's own segments and catalog.
async function assertMerchantRuleValues(
  container: MedusaContainer,
  merchantId: ResolvedMerchantId,
  rules: MerchantPromotionRuleInput[]
) {
  for (const [resource, ids] of idsByResource(rules)) {
    const owned = await listMerchantResourceIds(container, merchantId, resource)

    if (Array.from(ids).some((id) => !owned.has(id))) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Some of the chosen ${resourceNouns[resource]} aren't in this store`
      )
    }
  }
}

async function assertPromotionCodeAvailable(
  container: MedusaContainer,
  merchantId: ResolvedMerchantId,
  code: string,
  promotionId?: string
) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const [{ data: promotions }, { data: merchants }] = await Promise.all([
    query.graph({ entity: "promotion", fields: ["id"], filters: { code } }),
    query.graph({ entity: "merchant", fields: ["slug"], filters: { id: merchantId } }),
  ])
  const taken = (promotions as unknown as Array<{ id: string }>).some(
    ({ id }) => id !== promotionId
  )

  if (taken) {
    const slug = (merchants as unknown as Array<{ slug: string }>)[0]?.slug ?? ""

    throw new MedusaError(
      MedusaError.Types.DUPLICATE_ERROR,
      `The code ${code} is already used on this platform. Try another, like ${suggestPromotionCode(code, slug)}.`
    )
  }
}

async function assertCampaignNameAvailable(
  container: MedusaContainer,
  campaign: NormalizedMerchantCampaign,
  campaignId?: string
) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "campaign",
    fields: ["id"],
    filters: { campaign_identifier: campaign.campaign_identifier },
  })

  if ((data as unknown as Array<{ id: string }>).some(({ id }) => id !== campaignId)) {
    throw new MedusaError(
      MedusaError.Types.DUPLICATE_ERROR,
      `You already have a campaign called ${campaign.name}`
    )
  }
}

function assertPlatformCurrency(
  currencyCode: string | null | undefined,
  currencies: string[]
) {
  if (currencyCode && !currencies.includes(currencyCode)) {
    throw invalid(
      `Use one of the store's currencies: ${currencies
        .map((code) => code.toUpperCase())
        .join(", ")}`
    )
  }
}

export const listMerchantPromotionsStep = createStep(
  "list-merchant-promotions",
  async (
    input: {
      merchant_id: ResolvedMerchantId
      q?: string
      status?: MerchantPromotionStatus
      limit: number
      offset: number
    },
    { container }
  ) => {
    const ids = await listMerchantLinkedIds(container, input.merchant_id, "promotions")
    const [graphs, currencyCodes] = await Promise.all([
      queryPromotions(container, ids),
      listPlatformCurrencyCodes(container),
    ])
    const filtered = filterMerchantPromotions(
      graphs.map((graph) => toMerchantPromotion(graph)),
      input
    )
    const page = filtered.slice(input.offset, input.offset + input.limit)
    const pageGraphs = page.map(
      ({ id }) => graphs.find((graph) => graph.id === id)!
    )
    const labels = await ruleLabels(container, pageGraphs)

    return new StepResponse({
      promotions: pageGraphs.map((graph) => toMerchantPromotion(graph, labels)),
      count: filtered.length,
      limit: input.limit,
      offset: input.offset,
      currency_codes: currencyCodes,
    })
  }
)

export const retrieveMerchantPromotionStep = createStep(
  "retrieve-merchant-promotion",
  async (
    input: { merchant_id: ResolvedMerchantId; promotion_id: string },
    { container }
  ) => {
    await assertMerchantOwns(
      container,
      "promotion",
      input.promotion_id,
      input.merchant_id
    )

    const [graph] = await queryPromotions(container, [input.promotion_id])
    const [labels, currencyCodes] = await Promise.all([
      ruleLabels(container, [graph]),
      listPlatformCurrencyCodes(container),
    ])

    return new StepResponse({
      ...toMerchantPromotion(graph, labels),
      currency_codes: currencyCodes,
    })
  }
)

/**
 * Checks a new promotion, or an update merged with the stored one, and
 * returns it ready for Medusa's workflows: the code is free, conditions only
 * name the merchant's own records, currencies are the store's, and the
 * hidden shop rule leads the rules.
 */
export const prepareMerchantPromotionStep = createStep(
  "prepare-merchant-promotion",
  async (
    input: {
      merchant_id: ResolvedMerchantId
      sales_channel_id: string
      promotion_id?: string
      create?: MerchantPromotionInput
      update?: MerchantPromotionUpdate
      campaign?: MerchantCampaignInput
    },
    { container }
  ) => {
    let promotionInput: MerchantPromotionInput

    if (input.promotion_id) {
      await assertMerchantOwns(
        container,
        "promotion",
        input.promotion_id,
        input.merchant_id
      )

      const [current] = await queryPromotions(container, [input.promotion_id])
      promotionInput = mergeMerchantPromotion(
        toMerchantPromotionInput(current),
        input.update ?? {}
      )
    } else if (input.create) {
      promotionInput = input.create
    } else {
      throw invalid("Promotion details are required")
    }

    const currencies = await listPlatformCurrencyCodes(container)
    const normalized = normalizeMerchantPromotion({
      ...promotionInput,
      application_method: {
        ...promotionInput.application_method,
        // A percentage needs no currency, but one lets it join a campaign
        // with a spend budget, so the store's only currency is filled in.
        currency_code:
          promotionInput.application_method.currency_code ??
          (currencies.length === 1 ? currencies[0] : null),
      },
    })

    assertPlatformCurrency(normalized.application_method.currency_code, currencies)

    await Promise.all([
      assertPromotionCodeAvailable(
        container,
        input.merchant_id,
        normalized.code,
        input.promotion_id
      ),
      assertMerchantRuleValues(container, input.merchant_id, [
        ...normalized.rules,
        ...normalized.target_rules,
        ...normalized.buy_rules,
      ]),
    ])

    if (normalized.campaign_id) {
      await assertMerchantOwns(
        container,
        "campaign",
        normalized.campaign_id,
        input.merchant_id
      )

      const [campaign] = await queryCampaigns(container, [normalized.campaign_id])

      if (
        campaign?.budget?.type === "spend" &&
        campaign.budget.currency_code !== normalized.application_method.currency_code
      ) {
        throw invalid(
          `${campaign.name}'s budget is in ${String(campaign.budget.currency_code).toUpperCase()}, so its promotions must be too`
        )
      }
    }

    let campaign: NormalizedMerchantCampaign | null = null

    if (input.campaign) {
      if (normalized.campaign_id) {
        throw invalid("Choose an existing campaign or a new one, not both")
      }

      campaign = normalizeMerchantCampaign(input.merchant_id, input.campaign)
      assertPlatformCurrency(campaign.budget?.currency_code, currencies)

      if (
        campaign.budget?.type === "spend" &&
        campaign.budget.currency_code !== normalized.application_method.currency_code
      ) {
        throw invalid("A campaign's spend budget must be in the promotion's currency")
      }

      await assertCampaignNameAvailable(container, campaign)
    }

    return new StepResponse({
      promotion: {
        ...normalized,
        rules: [shopRule(input.sales_channel_id), ...normalized.rules],
      },
      // Rules are only replaced when the update names them.
      replace: {
        rules: !input.promotion_id || input.update?.rules !== undefined,
        target_rules:
          !input.promotion_id || input.update?.target_rules !== undefined,
        buy_rules: !input.promotion_id || input.update?.buy_rules !== undefined,
      },
      campaign,
    })
  }
)

type PromotionRules = {
  rules: MerchantPromotionRuleInput[]
  target_rules: MerchantPromotionRuleInput[]
  buy_rules: MerchantPromotionRuleInput[]
}

type StoredRule = {
  id: string
  attribute: string
  operator: string
  values?: Array<{ value: string }>
}

const toRuleData = (rules: StoredRule[] = []) =>
  rules.map((rule) => ({
    attribute: rule.attribute,
    operator: rule.operator as MerchantPromotionRuleInput["operator"],
    values: (rule.values ?? []).map(({ value }) => value),
  }))

async function readStoredRules(
  service: IPromotionModuleService,
  promotionId: string
) {
  const promotion = (await service.retrievePromotion(promotionId, {
    relations: [
      "rules.values",
      "application_method.target_rules.values",
      "application_method.buy_rules.values",
    ],
  })) as unknown as {
    rules?: StoredRule[]
    application_method?: {
      target_rules?: StoredRule[]
      buy_rules?: StoredRule[]
    }
  }

  return {
    rules: promotion.rules ?? [],
    target_rules: promotion.application_method?.target_rules ?? [],
    buy_rules: promotion.application_method?.buy_rules ?? [],
  }
}

async function writeRules(
  service: IPromotionModuleService,
  promotionId: string,
  stored: Awaited<ReturnType<typeof readStoredRules>>,
  next: Partial<PromotionRules>
) {
  if (next.rules) {
    if (stored.rules.length) {
      await service.removePromotionRules(promotionId, stored.rules.map(({ id }) => id))
    }
    if (next.rules.length) {
      await service.addPromotionRules(promotionId, next.rules)
    }
  }

  if (next.target_rules) {
    if (stored.target_rules.length) {
      await service.removePromotionTargetRules(
        promotionId,
        stored.target_rules.map(({ id }) => id)
      )
    }
    if (next.target_rules.length) {
      await service.addPromotionTargetRules(promotionId, next.target_rules)
    }
  }

  if (next.buy_rules) {
    if (stored.buy_rules.length) {
      await service.removePromotionBuyRules(
        promotionId,
        stored.buy_rules.map(({ id }) => id)
      )
    }
    if (next.buy_rules.length) {
      await service.addPromotionBuyRules(promotionId, next.buy_rules)
    }
  }
}

/**
 * Replaces whole rule sets, the hidden shop rule included, so a rollback
 * puts back exactly the rules that were there.
 */
export const replaceMerchantPromotionRulesStep = createStep(
  "replace-merchant-promotion-rules",
  async (
    input: { promotion_id: string } & Partial<PromotionRules>,
    { container }
  ) => {
    const service = container.resolve<IPromotionModuleService>(Modules.PROMOTION)
    const { promotion_id, ...next } = input
    const types = (["rules", "target_rules", "buy_rules"] as const).filter(
      (type) => next[type] !== undefined
    )

    if (!types.length) {
      return new StepResponse(undefined, null)
    }

    const stored = await readStoredRules(service, promotion_id)

    await writeRules(service, promotion_id, stored, next)

    return new StepResponse(undefined, {
      promotion_id,
      previous: Object.fromEntries(
        types.map((type) => [type, toRuleData(stored[type])])
      ) as Partial<PromotionRules>,
    })
  },
  async (compensation, { container }) => {
    if (!compensation) {
      return
    }

    const service = container.resolve<IPromotionModuleService>(Modules.PROMOTION)
    const stored = await readStoredRules(service, compensation.promotion_id)

    await writeRules(
      service,
      compensation.promotion_id,
      stored,
      compensation.previous
    )
  }
)

export const listMerchantCampaignsStep = createStep(
  "list-merchant-campaigns",
  async (
    input: {
      merchant_id: ResolvedMerchantId
      q?: string
      limit: number
      offset: number
    },
    { container }
  ) => {
    const ids = await listMerchantLinkedIds(container, input.merchant_id, "campaigns")
    const [graphs, currencyCodes] = await Promise.all([
      queryCampaigns(container, ids),
      listPlatformCurrencyCodes(container),
    ])
    const term = input.q?.trim().toLowerCase()
    const campaigns = graphs
      .map((graph) => toMerchantCampaign(graph))
      .filter(({ name }) => !term || name.toLowerCase().includes(term))
      .sort((left, right) =>
        (right.created_at ?? "").localeCompare(left.created_at ?? "")
      )

    return new StepResponse({
      campaigns: campaigns.slice(input.offset, input.offset + input.limit),
      count: campaigns.length,
      limit: input.limit,
      offset: input.offset,
      currency_codes: currencyCodes,
    })
  }
)

export const retrieveMerchantCampaignStep = createStep(
  "retrieve-merchant-campaign",
  async (
    input: { merchant_id: ResolvedMerchantId; campaign_id: string },
    { container }
  ) => {
    await assertMerchantOwns(
      container,
      "campaign",
      input.campaign_id,
      input.merchant_id
    )

    const [campaign] = await queryCampaigns(container, [input.campaign_id])
    const promotions = await queryPromotions(
      container,
      (campaign.promotions ?? []).map(({ id }) => id)
    )
    const labels = await ruleLabels(container, promotions)

    return new StepResponse({
      ...toMerchantCampaign(campaign),
      promotions: filterMerchantPromotions(
        promotions.map((promotion) => toMerchantPromotion(promotion, labels)),
        {}
      ),
    })
  }
)

/** Checks a new campaign, or an update merged with the stored one. */
export const prepareMerchantCampaignStep = createStep(
  "prepare-merchant-campaign",
  async (
    input: {
      merchant_id: ResolvedMerchantId
      campaign_id?: string
      create?: MerchantCampaignInput
      update?: MerchantCampaignUpdate
    },
    { container }
  ) => {
    let campaignInput: MerchantCampaignInput

    if (input.campaign_id) {
      await assertMerchantOwns(
        container,
        "campaign",
        input.campaign_id,
        input.merchant_id
      )

      const [current] = await queryCampaigns(container, [input.campaign_id])
      campaignInput = mergeMerchantCampaign(current, input.update ?? {})
    } else if (input.create) {
      campaignInput = input.create
    } else {
      throw invalid("Campaign details are required")
    }

    const campaign = normalizeMerchantCampaign(input.merchant_id, campaignInput)
    const currencies = await listPlatformCurrencyCodes(container)

    assertPlatformCurrency(campaign.budget?.currency_code, currencies)
    await assertCampaignNameAvailable(container, campaign, input.campaign_id)

    return new StepResponse(campaign)
  }
)

export const validateMerchantPromotionIdsStep = createStep(
  "validate-merchant-promotion-ids",
  async (
    input: { merchant_id: ResolvedMerchantId; promotion_ids: string[] },
    { container }
  ) => {
    const owned = new Set(
      await listMerchantLinkedIds(container, input.merchant_id, "promotions")
    )
    const ids = Array.from(new Set(input.promotion_ids))

    if (ids.some((id) => !owned.has(id))) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, "Promotion not found")
    }

    return new StepResponse(ids)
  }
)

export const assertMerchantOwnsPromotionResourceStep = createStep(
  "assert-merchant-owns-promotion-resource",
  async (
    input: {
      merchant_id: ResolvedMerchantId
      resource: "promotion" | "campaign"
      id: string
    },
    { container }
  ) => {
    await assertMerchantOwns(container, input.resource, input.id, input.merchant_id)

    return new StepResponse(input.id)
  }
)
