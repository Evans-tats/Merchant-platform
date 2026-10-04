import {
  campaignIdentifier,
  campaignStatus,
  mergeMerchantCampaign,
  mergeMerchantPromotion,
  normalizeMerchantCampaign,
  normalizeMerchantPromotion,
  normalizePromotionCode,
  suggestPromotionCode,
  toCreatePromotionData,
  toMerchantPromotion,
  toMerchantPromotionInput,
  type MerchantPromotionInput,
  type PromotionGraph,
} from "../merchant-promotions"

const percentOffProducts = (
  overrides: Partial<MerchantPromotionInput> = {}
): MerchantPromotionInput => ({
  code: "vip10",
  type: "standard",
  status: "active",
  is_automatic: false,
  application_method: {
    type: "percentage",
    target_type: "items",
    value: 10,
  },
  target_rules: [
    { attribute: "items.product.id", operator: "in", values: ["prod_1"] },
  ],
  ...overrides,
})

describe("promotion codes", () => {
  it("are stored in capitals and suggested with the shop's name", () => {
    expect(normalizePromotionCode("  vip10 ")).toBe("VIP10")
    expect(suggestPromotionCode("VIP10", "neema-fashion")).toBe(
      "VIP10-NEEMA-FASHION"
    )
    expect(suggestPromotionCode("A".repeat(38), "shop")).toBe(
      `${"A".repeat(35)}-SHOP`
    )
  })
})

describe("normalizeMerchantPromotion", () => {
  it("spreads a percentage off products across the items", () => {
    expect(normalizeMerchantPromotion(percentOffProducts())).toMatchObject({
      code: "VIP10",
      limit: null,
      application_method: {
        allocation: "across",
        max_quantity: null,
        value: 10,
      },
      target_rules: [{ values: ["prod_1"] }],
      buy_rules: [],
    })
  })

  it("takes a fixed amount off each item up to a number of items", () => {
    const normalized = normalizeMerchantPromotion(
      percentOffProducts({
        application_method: {
          type: "fixed",
          target_type: "items",
          allocation: "each",
          value: 200,
          currency_code: "KES",
          max_quantity: 3,
        },
      })
    )

    expect(normalized.application_method).toMatchObject({
      allocation: "each",
      currency_code: "kes",
      max_quantity: 3,
    })
    expect(() =>
      normalizeMerchantPromotion(
        percentOffProducts({
          application_method: {
            type: "fixed",
            target_type: "items",
            allocation: "each",
            value: 200,
            currency_code: "kes",
          },
        })
      )
    ).toThrow("Say how many items in one order get the discount")
  })

  it("spreads an order discount across the order and refuses item rules", () => {
    const order = {
      type: "fixed" as const,
      target_type: "order" as const,
      value: 500,
      currency_code: "kes",
    }

    expect(
      normalizeMerchantPromotion(
        percentOffProducts({ application_method: order, target_rules: [] })
      ).application_method
    ).toMatchObject({ allocation: "across", max_quantity: null })
    expect(() =>
      normalizeMerchantPromotion(percentOffProducts({ application_method: order }))
    ).toThrow("An order discount applies to the whole order, not chosen items")
  })

  it("discounts exactly the items buy X get Y gives", () => {
    const normalized = normalizeMerchantPromotion(
      percentOffProducts({
        type: "buyget",
        application_method: {
          type: "percentage",
          target_type: "items",
          value: 100,
          buy_rules_min_quantity: 2,
          apply_to_quantity: 1,
        },
        buy_rules: [
          { attribute: "items.product.collection_id", operator: "in", values: ["pcol_1"] },
        ],
      })
    )

    expect(normalized.application_method).toMatchObject({
      allocation: "each",
      max_quantity: 1,
      buy_rules_min_quantity: 2,
      apply_to_quantity: 1,
    })
    expect(() =>
      normalizeMerchantPromotion(
        percentOffProducts({
          type: "buyget",
          application_method: {
            type: "percentage",
            target_type: "items",
            value: 100,
            buy_rules_min_quantity: 2,
            apply_to_quantity: 1,
          },
        })
      )
    ).toThrow("Choose the items the customer has to buy")
  })

  it("refuses conditions merchants can't set and bad values", () => {
    expect(() =>
      normalizeMerchantPromotion(
        percentOffProducts({
          rules: [
            { attribute: "sales_channel_id", operator: "in", values: ["sc_other"] },
          ],
        })
      )
    ).toThrow("Who can use it can't use the condition sales_channel_id")
    expect(() =>
      normalizeMerchantPromotion(percentOffProducts({ code: "VIP 10" }))
    ).toThrow("letters, numbers, dashes or underscores")
    expect(() =>
      normalizeMerchantPromotion(
        percentOffProducts({
          application_method: { type: "percentage", target_type: "items", value: 120 },
        })
      )
    ).toThrow("at most 100")
    expect(() =>
      normalizeMerchantPromotion(
        percentOffProducts({
          application_method: { type: "fixed", target_type: "order", value: 50 },
          target_rules: [],
        })
      )
    ).toThrow("Choose the currency of the discount amount")
    expect(() =>
      normalizeMerchantPromotion(percentOffProducts({ limit: 0 }))
    ).toThrow("whole number of at least 1")
  })
})

const stored: PromotionGraph = {
  id: "promo_1",
  code: "VIP10",
  type: "standard",
  status: "active",
  is_automatic: false,
  limit: 50,
  used: 3,
  application_method: {
    type: "fixed",
    target_type: "items",
    allocation: "each",
    value: "200",
    currency_code: "kes",
    max_quantity: 2,
    target_rules: [
      { id: "rule_t", attribute: "items.product.id", operator: "in", values: [{ value: "prod_1" }] },
    ],
    buy_rules: [],
  },
  rules: [
    { id: "rule_shop", attribute: "sales_channel_id", operator: "in", values: [{ value: "sc_a" }] },
    { id: "rule_vip", attribute: "customer.groups.id", operator: "in", values: [{ value: "cusgroup_vip" }] },
  ],
  campaign: {
    id: "procamp_1",
    name: "Black Friday",
    starts_at: "2030-11-28T00:00:00.000Z",
    ends_at: "2030-11-30T23:59:59.000Z",
    budget: { type: "usage", limit: 100, used: 7 },
  },
}

describe("stored promotions", () => {
  it("are shown without the hidden shop rule, with names for their values", () => {
    const promotion = toMerchantPromotion(
      stored,
      new Map([
        ["prod_1", "Kikoi"],
        ["cusgroup_vip", "VIP"],
      ]),
      new Date("2026-10-04T00:00:00.000Z")
    )

    expect(promotion).toMatchObject({
      limit: 50,
      used: 3,
      application_method: { value: 200, max_quantity: 2 },
      rules: [
        { attribute: "customer.groups.id", values: [{ value: "cusgroup_vip", label: "VIP" }] },
      ],
      target_rules: [{ values: [{ value: "prod_1", label: "Kikoi" }] }],
      campaign: {
        name: "Black Friday",
        status: "scheduled",
        budget: { type: "usage", limit: 100, used: 7 },
      },
    })
    expect(JSON.stringify(promotion)).not.toContain("sales_channel_id")
  })

  it("merge an update without changing the type or how the amount is spread", () => {
    const merged = mergeMerchantPromotion(toMerchantPromotionInput(stored), {
      status: "inactive",
      application_method: { value: 250 },
    })

    expect(merged).toMatchObject({
      status: "inactive",
      type: "standard",
      application_method: {
        type: "fixed",
        target_type: "items",
        allocation: "each",
        value: 250,
        max_quantity: 2,
      },
      rules: [{ attribute: "customer.groups.id", values: ["cusgroup_vip"] }],
    })
  })

  it("become Medusa create data with the campaign", () => {
    const data = toCreatePromotionData(
      normalizeMerchantPromotion(percentOffProducts()),
      "procamp_new"
    )

    expect(data).toMatchObject({
      code: "VIP10",
      campaign_id: "procamp_new",
      application_method: {
        target_rules: [{ attribute: "items.product.id" }],
        buy_rules: [],
      },
    })
  })
})

describe("campaigns", () => {
  it("are named once per merchant and need a currency for a spend budget", () => {
    expect(campaignIdentifier("mer_a", "  Black   Friday ")).toBe("mer_a:black friday")
    expect(
      normalizeMerchantCampaign("mer_a", {
        name: "Welcome",
        budget: { type: "usage", limit: 100 },
      })
    ).toMatchObject({
      campaign_identifier: "mer_a:welcome",
      budget: { type: "usage", limit: 100, currency_code: null },
    })
    expect(() =>
      normalizeMerchantCampaign("mer_a", {
        name: "Sale",
        budget: { type: "spend", limit: 5000 },
      })
    ).toThrow("Choose the currency of the spend budget")
    expect(() =>
      normalizeMerchantCampaign("mer_a", {
        name: "Sale",
        starts_at: "2026-10-10T00:00:00.000Z",
        ends_at: "2026-10-01T00:00:00.000Z",
      })
    ).toThrow("The campaign has to end after it starts")
  })

  it("report whether they are scheduled, running or over", () => {
    const now = new Date("2026-10-04T12:00:00.000Z")

    expect(campaignStatus({ starts_at: "2026-11-01T00:00:00.000Z" }, now)).toBe("scheduled")
    expect(campaignStatus({ ends_at: "2026-10-01T00:00:00.000Z" }, now)).toBe("ended")
    expect(campaignStatus({}, now)).toBe("active")
  })

  it("keep their budget's type when updated", () => {
    expect(
      mergeMerchantCampaign(stored.campaign!, { budget: { limit: 250 } })
    ).toMatchObject({
      name: "Black Friday",
      budget: { type: "usage", limit: 250 },
    })
    expect(() =>
      mergeMerchantCampaign({ id: "procamp_2", name: "Plain" }, { budget: { limit: 5 } })
    ).toThrow("This campaign has no budget to change")
  })
})
