import { Modules } from "@medusajs/framework/utils"
import {
  createWorkflow,
  transform,
  when,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import {
  createCampaignsWorkflow,
  createPromotionsWorkflow,
  createRemoteLinkStep,
  deletePromotionsWorkflow,
  dismissRemoteLinkStep,
  updatePromotionsWorkflow,
} from "@medusajs/medusa/core-flows"

import { MERCHANT_MODULE } from "../modules/merchant"
import {
  toCreatePromotionData,
  toUpdatePromotionData,
  type MerchantCampaignInput,
  type MerchantPromotionInput,
  type MerchantPromotionStatus,
  type MerchantPromotionUpdate,
} from "../services/merchant-promotions"
import {
  assertMerchantOwnsPromotionResourceStep,
  listMerchantPromotionsStep,
  prepareMerchantPromotionStep,
  replaceMerchantPromotionRulesStep,
  retrieveMerchantPromotionStep,
} from "./steps/merchant-promotions"
import {
  type MerchantScopeInput,
  validateMerchantScopeStep,
} from "./steps/validate-merchant-commerce"

export type ListMerchantPromotionsInput = MerchantScopeInput & {
  q?: string
  status?: MerchantPromotionStatus
  limit: number
  offset: number
}

type MerchantPromotionScope = MerchantScopeInput & { promotion_id: string }

export type CreateMerchantPromotionInput = MerchantScopeInput & {
  promotion: MerchantPromotionInput
  // A new campaign made with the promotion, in the same transaction.
  campaign?: MerchantCampaignInput
}

export type UpdateMerchantPromotionInput = MerchantPromotionScope & {
  update: MerchantPromotionUpdate
}

export const listMerchantPromotionsWorkflow = createWorkflow(
  "list-merchant-promotions",
  function (input: ListMerchantPromotionsInput) {
    const scope = validateMerchantScopeStep(input)
    const promotions = listMerchantPromotionsStep({
      merchant_id: scope.merchant_id,
      q: input.q,
      status: input.status,
      limit: input.limit,
      offset: input.offset,
    })

    return new WorkflowResponse(promotions)
  }
)

export const retrieveMerchantPromotionWorkflow = createWorkflow(
  "retrieve-merchant-promotion",
  function (input: MerchantPromotionScope) {
    const scope = validateMerchantScopeStep(input)
    const promotion = retrieveMerchantPromotionStep({
      merchant_id: scope.merchant_id,
      promotion_id: input.promotion_id,
    })

    return new WorkflowResponse(promotion)
  }
)

export const createMerchantPromotionWorkflow = createWorkflow(
  "create-merchant-promotion",
  function (input: CreateMerchantPromotionInput) {
    const scope = validateMerchantScopeStep(input)
    const prepared = prepareMerchantPromotionStep({
      merchant_id: scope.merchant_id,
      sales_channel_id: scope.sales_channel_id,
      create: input.promotion,
      campaign: input.campaign,
    })
    const campaigns = when(
      "create-campaign-with-promotion",
      { prepared },
      ({ prepared }) => Boolean(prepared.campaign)
    ).then(() => {
      const campaignsInput = transform({ prepared }, ({ prepared }) => ({
        campaignsData: [prepared.campaign!],
      }))

      return createCampaignsWorkflow.runAsStep({ input: campaignsInput })
    })
    const promotionsInput = transform(
      { prepared, campaigns },
      ({ prepared, campaigns }) => ({
        promotionsData: [
          toCreatePromotionData(prepared.promotion, campaigns?.[0]?.id),
        ],
      })
    )
    const promotions = createPromotionsWorkflow.runAsStep({
      input: promotionsInput,
    })
    const links = transform(
      { scope, promotions, campaigns },
      ({ scope, promotions, campaigns }) => [
        {
          [MERCHANT_MODULE]: { merchant_id: scope.merchant_id },
          [Modules.PROMOTION]: { promotion_id: promotions[0].id },
        },
        ...(campaigns ?? []).map((campaign) => ({
          [MERCHANT_MODULE]: { merchant_id: scope.merchant_id },
          [Modules.PROMOTION]: { campaign_id: campaign.id },
        })),
      ]
    )

    createRemoteLinkStep(links)

    const promotionId = transform({ promotions }, ({ promotions }) => promotions[0].id)
    const promotion = retrieveMerchantPromotionStep({
      merchant_id: scope.merchant_id,
      promotion_id: promotionId,
    })

    return new WorkflowResponse(promotion)
  }
)

export const updateMerchantPromotionWorkflow = createWorkflow(
  "update-merchant-promotion",
  function (input: UpdateMerchantPromotionInput) {
    const scope = validateMerchantScopeStep(input)
    const prepared = prepareMerchantPromotionStep({
      merchant_id: scope.merchant_id,
      sales_channel_id: scope.sales_channel_id,
      promotion_id: input.promotion_id,
      update: input.update,
    })
    const updateInput = transform({ input, prepared }, ({ input, prepared }) => ({
      promotionsData: [toUpdatePromotionData(input.promotion_id, prepared.promotion)],
    }))

    updatePromotionsWorkflow.runAsStep({ input: updateInput })

    const rulesInput = transform({ input, prepared }, ({ input, prepared }) => ({
      promotion_id: input.promotion_id,
      rules: prepared.replace.rules ? prepared.promotion.rules : undefined,
      target_rules: prepared.replace.target_rules
        ? prepared.promotion.target_rules
        : undefined,
      buy_rules: prepared.replace.buy_rules
        ? prepared.promotion.buy_rules
        : undefined,
    }))

    replaceMerchantPromotionRulesStep(rulesInput)

    const promotion = retrieveMerchantPromotionStep({
      merchant_id: scope.merchant_id,
      promotion_id: input.promotion_id,
    })

    return new WorkflowResponse(promotion)
  }
)

export const deleteMerchantPromotionWorkflow = createWorkflow(
  "delete-merchant-promotion",
  function (input: MerchantPromotionScope) {
    const scope = validateMerchantScopeStep(input)

    assertMerchantOwnsPromotionResourceStep({
      merchant_id: scope.merchant_id,
      resource: "promotion",
      id: input.promotion_id,
    })

    const deleteInput = transform({ input }, ({ input }) => ({
      ids: [input.promotion_id],
    }))

    deletePromotionsWorkflow.runAsStep({ input: deleteInput })

    const links = transform({ input, scope }, ({ input, scope }) => [
      {
        [MERCHANT_MODULE]: { merchant_id: scope.merchant_id },
        [Modules.PROMOTION]: { promotion_id: input.promotion_id },
      },
    ])

    dismissRemoteLinkStep(links)

    const result = transform({ input }, ({ input }) => ({
      id: input.promotion_id,
      object: "promotion",
      deleted: true,
    }))

    return new WorkflowResponse(result)
  }
)
