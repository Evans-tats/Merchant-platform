import type { MerchantPromotion } from "../merchant-api"
import {
  budgetPercent,
  campaignPayload,
  campaignUpdatePayload,
  dateInputToIso,
  describeBudget,
  describeDiscount,
  describeItems,
  describeWho,
  emptyPromotionForm,
  isoToDateInput,
  promotionFormFrom,
  promotionFormProblem,
  promotionPayload,
  promotionUpdatePayload,
  templateOf,
} from "../merchant-promotions"

const promotion = (overrides: Partial<MerchantPromotion> = {}): MerchantPromotion => ({
  id: "promo_1",
  code: "VIP10",
  type: "standard",
  status: "active",
  is_automatic: false,
  limit: null,
  used: 0,
  application_method: {
    type: "percentage",
    target_type: "items",
    allocation: "across",
    value: 10,
    currency_code: "kes",
    max_quantity: null,
    buy_rules_min_quantity: null,
    apply_to_quantity: null,
  },
  rules: [],
  target_rules: [],
  buy_rules: [],
  campaign: null,
  created_at: null,
  updated_at: null,
  ...overrides,
})

describe("describing promotions", () => {
  it("says what the discount is in a few words", () => {
    expect(describeDiscount(promotion())).toBe("10% off products")
    expect(
      describeDiscount(
        promotion({
          application_method: {
            ...promotion().application_method,
            type: "fixed",
            target_type: "order",
            value: 500,
          },
        })
      )
    ).toMatch(/500.*off the order/)
    expect(
      describeDiscount(
        promotion({
          type: "buyget",
          application_method: {
            ...promotion().application_method,
            value: 100,
            buy_rules_min_quantity: 2,
            apply_to_quantity: 1,
          },
        })
      )
    ).toBe("Buy 2, get 1 free")
  })

  it("names the items and who can use it", () => {
    const vip = promotion({
      rules: [
        {
          id: "rule_1",
          attribute: "customer.groups.id",
          operator: "in",
          values: [{ value: "cusgroup_vip", label: "VIP" }],
        },
      ],
      target_rules: [
        {
          id: "rule_2",
          attribute: "items.product.collection_id",
          operator: "in",
          values: [{ value: "pcol_1", label: "Summer" }],
        },
      ],
    })

    expect(describeWho(vip)).toBe("VIP")
    expect(describeWho(promotion())).toBe("Everyone")
    expect(describeItems(vip.target_rules, "items")).toBe("Summer")
    expect(describeItems([], "items")).toBe("All products")
    expect(describeItems([], "order")).toBe("Whole order")
  })

  it("shows how much of a budget is used", () => {
    const usage = { type: "usage" as const, limit: 100, used: 37, currency_code: null }

    expect(describeBudget(usage)).toBe("37 of 100 uses")
    expect(budgetPercent(usage)).toBe(37)
    expect(budgetPercent({ ...usage, used: 150 })).toBe(100)
    expect(budgetPercent(null)).toBeNull()
    expect(describeBudget(null)).toBe("No limit")
  })
})

describe("the promotion form", () => {
  it("sends a percentage off chosen products to segment customers", () => {
    const form = {
      ...emptyPromotionForm("percentage_off_products", "kes"),
      code: "VIP10",
      value: "10",
      status: "active" as const,
      who: "segments" as const,
      segment_ids: ["cusgroup_vip"],
      items: { scope: "collections" as const, ids: ["pcol_1"] },
    }

    expect(promotionFormProblem(form)).toBeNull()
    expect(promotionPayload(form)).toEqual({
      code: "VIP10",
      type: "standard",
      status: "active",
      is_automatic: false,
      limit: null,
      application_method: {
        type: "percentage",
        target_type: "items",
        allocation: null,
        value: 10,
        currency_code: "kes",
        max_quantity: null,
        buy_rules_min_quantity: null,
        apply_to_quantity: null,
      },
      rules: [{ attribute: "customer.groups.id", operator: "in", values: ["cusgroup_vip"] }],
      target_rules: [
        { attribute: "items.product.collection_id", operator: "in", values: ["pcol_1"] },
      ],
      buy_rules: [],
    })
  })

  it("adds a new campaign with dates and a spend budget", () => {
    const form = {
      ...emptyPromotionForm("amount_off_order", "kes"),
      code: "KARIBU",
      value: "500",
      campaign_mode: "new" as const,
      campaign: {
        name: "Welcome",
        description: "",
        starts_at: "2026-10-01",
        ends_at: "2026-10-31",
        budget_type: "spend" as const,
        budget_limit: "20000",
      },
    }
    const payload = promotionPayload(form)

    expect(payload.target_rules).toEqual([])
    expect(payload.campaign).toMatchObject({
      name: "Welcome",
      description: null,
      budget: { type: "spend", limit: 20000, currency_code: "kes" },
    })
    expect(new Date(payload.campaign!.starts_at!).getDate()).toBe(1)
    expect(new Date(payload.campaign!.ends_at!).getHours()).toBe(23)
  })

  it("says what's missing before it can be sent", () => {
    const empty = emptyPromotionForm("amount_off_products", "kes")

    expect(promotionFormProblem(empty)).toBe("Add a code")
    expect(promotionFormProblem({ ...empty, code: "X1", value: "100", max_quantity: "" })).toBe(
      "Say how many items get the discount"
    )
    expect(
      promotionFormProblem({ ...empty, code: "X1", value: "100", who: "segments" })
    ).toBe("Choose at least one customer segment")
    expect(
      promotionFormProblem({
        ...emptyPromotionForm("buy_get", "kes"),
        code: "KIKOI3",
      })
    ).toBe("Choose the items the customer buys and gets")
    expect(
      promotionFormProblem({
        ...empty,
        code: "X1",
        value: "100",
        campaign_mode: "existing",
      })
    ).toBe("Choose a campaign")
  })

  it("edits a stored promotion without changing its type", () => {
    const stored = promotion({
      type: "buyget",
      application_method: {
        ...promotion().application_method,
        allocation: "each",
        value: 100,
        max_quantity: 1,
        buy_rules_min_quantity: 2,
        apply_to_quantity: 1,
      },
      buy_rules: [
        {
          id: "rule_b",
          attribute: "items.product.id",
          operator: "in",
          values: [{ value: "prod_1", label: "Kikoi" }],
        },
      ],
      target_rules: [
        {
          id: "rule_t",
          attribute: "items.product.id",
          operator: "in",
          values: [{ value: "prod_1", label: "Kikoi" }],
        },
      ],
      campaign: {
        id: "procamp_1",
        name: "Black Friday",
        description: null,
        starts_at: null,
        ends_at: null,
        budget: null,
        promotion_count: 1,
        status: "active",
        created_at: null,
        updated_at: null,
      },
    })
    const form = promotionFormFrom(stored)

    expect(templateOf(stored)).toBe("buy_get")
    expect(form).toMatchObject({
      template: "buy_get",
      buy_quantity: "2",
      buy_items: { scope: "products", ids: ["prod_1"] },
      campaign_mode: "existing",
      campaign_id: "procamp_1",
    })
    expect(promotionUpdatePayload({ ...form, get_quantity: "2" })).toMatchObject({
      application_method: { apply_to_quantity: 2, buy_rules_min_quantity: 2 },
      buy_rules: [{ values: ["prod_1"] }],
      target_rules: [{ values: ["prod_1"] }],
      campaign_id: "procamp_1",
    })
    expect(promotionUpdatePayload({ ...form, campaign_mode: "none" }).campaign_id).toBeNull()
  })
})

describe("campaign dates", () => {
  it("round-trip through date inputs as whole days", () => {
    const start = dateInputToIso("2026-11-28", "start")!

    expect(isoToDateInput(start)).toBe("2026-11-28")
    expect(dateInputToIso("", "end")).toBeNull()
    expect(
      campaignUpdatePayload(
        {
          name: " Black Friday ",
          description: "",
          starts_at: "",
          ends_at: "",
          budget_type: "usage",
          budget_limit: "150",
        },
        {
          id: "procamp_1",
          name: "Black Friday",
          description: null,
          starts_at: null,
          ends_at: null,
          budget: { type: "usage", limit: 100, used: 7, currency_code: null },
          promotion_count: 0,
          status: "active",
          created_at: null,
          updated_at: null,
        }
      )
    ).toEqual({
      name: "Black Friday",
      description: null,
      starts_at: null,
      ends_at: null,
      budget: { limit: 150 },
    })
    expect(campaignPayload({
      name: "Plain",
      description: "",
      starts_at: "",
      ends_at: "",
      budget_type: "none",
      budget_limit: "",
    }, "kes").budget).toBeNull()
  })
})
