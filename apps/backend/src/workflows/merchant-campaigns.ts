import { Modules } from "@medusajs/framework/utils"
import {
  createWorkflow,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import {
  addOrRemoveCampaignPromotionsWorkflow,
  createCampaignsWorkflow,
  createRemoteLinkStep,
  deleteCampaignsWorkflow,
  dismissRemoteLinkStep,
  updateCampaignsWorkflow,
} from "@medusajs/medusa/core-flows"

import { MERCHANT_MODULE } from "../modules/merchant"
import type {
  MerchantCampaignInput,
  MerchantCampaignUpdate,
} from "../services/merchant-promotions"
import {
  assertMerchantOwnsPromotionResourceStep,
  listMerchantCampaignsStep,
  prepareMerchantCampaignStep,
  retrieveMerchantCampaignStep,
  validateMerchantPromotionIdsStep,
} from "./steps/merchant-promotions"
import {
  type MerchantScopeInput,
  validateMerchantScopeStep,
} from "./steps/validate-merchant-commerce"

export type ListMerchantCampaignsInput = MerchantScopeInput & {
  q?: string
  limit: number
  offset: number
}

type MerchantCampaignScope = MerchantScopeInput & { campaign_id: string }

export type CreateMerchantCampaignInput = MerchantScopeInput & {
  campaign: MerchantCampaignInput
}

export type UpdateMerchantCampaignInput = MerchantCampaignScope & {
  update: MerchantCampaignUpdate
}

export type ManageMerchantCampaignPromotionsInput = MerchantCampaignScope & {
  add?: string[]
  remove?: string[]
}

export const listMerchantCampaignsWorkflow = createWorkflow(
  "list-merchant-campaigns",
  function (input: ListMerchantCampaignsInput) {
    const scope = validateMerchantScopeStep(input)
    const campaigns = listMerchantCampaignsStep({
      merchant_id: scope.merchant_id,
      q: input.q,
      limit: input.limit,
      offset: input.offset,
    })

    return new WorkflowResponse(campaigns)
  }
)

export const retrieveMerchantCampaignWorkflow = createWorkflow(
  "retrieve-merchant-campaign",
  function (input: MerchantCampaignScope) {
    const scope = validateMerchantScopeStep(input)
    const campaign = retrieveMerchantCampaignStep({
      merchant_id: scope.merchant_id,
      campaign_id: input.campaign_id,
    })

    return new WorkflowResponse(campaign)
  }
)

export const createMerchantCampaignWorkflow = createWorkflow(
  "create-merchant-campaign",
  function (input: CreateMerchantCampaignInput) {
    const scope = validateMerchantScopeStep(input)
    const prepared = prepareMerchantCampaignStep({
      merchant_id: scope.merchant_id,
      create: input.campaign,
    })
    const campaignsInput = transform({ prepared }, ({ prepared }) => ({
      campaignsData: [prepared],
    }))
    const campaigns = createCampaignsWorkflow.runAsStep({ input: campaignsInput })
    const links = transform({ scope, campaigns }, ({ scope, campaigns }) => [
      {
        [MERCHANT_MODULE]: { merchant_id: scope.merchant_id },
        [Modules.PROMOTION]: { campaign_id: campaigns[0].id },
      },
    ])

    createRemoteLinkStep(links)

    const campaignId = transform({ campaigns }, ({ campaigns }) => campaigns[0].id)
    const campaign = retrieveMerchantCampaignStep({
      merchant_id: scope.merchant_id,
      campaign_id: campaignId,
    })

    return new WorkflowResponse(campaign)
  }
)

export const updateMerchantCampaignWorkflow = createWorkflow(
  "update-merchant-campaign",
  function (input: UpdateMerchantCampaignInput) {
    const scope = validateMerchantScopeStep(input)
    const prepared = prepareMerchantCampaignStep({
      merchant_id: scope.merchant_id,
      campaign_id: input.campaign_id,
      update: input.update,
    })
    const updateInput = transform({ input, prepared }, ({ input, prepared }) => ({
      campaignsData: [
        {
          id: input.campaign_id,
          name: prepared.name,
          description: prepared.description,
          campaign_identifier: prepared.campaign_identifier,
          starts_at: prepared.starts_at,
          ends_at: prepared.ends_at,
          ...(prepared.budget ? { budget: { limit: prepared.budget.limit } } : {}),
        },
      ],
    }))

    updateCampaignsWorkflow.runAsStep({ input: updateInput })

    const campaign = retrieveMerchantCampaignStep({
      merchant_id: scope.merchant_id,
      campaign_id: input.campaign_id,
    })

    return new WorkflowResponse(campaign)
  }
)

export const deleteMerchantCampaignWorkflow = createWorkflow(
  "delete-merchant-campaign",
  function (input: MerchantCampaignScope) {
    const scope = validateMerchantScopeStep(input)

    assertMerchantOwnsPromotionResourceStep({
      merchant_id: scope.merchant_id,
      resource: "campaign",
      id: input.campaign_id,
    })

    const deleteInput = transform({ input }, ({ input }) => ({
      ids: [input.campaign_id],
    }))

    deleteCampaignsWorkflow.runAsStep({ input: deleteInput })

    const links = transform({ input, scope }, ({ input, scope }) => [
      {
        [MERCHANT_MODULE]: { merchant_id: scope.merchant_id },
        [Modules.PROMOTION]: { campaign_id: input.campaign_id },
      },
    ])

    dismissRemoteLinkStep(links)

    const result = transform({ input }, ({ input }) => ({
      id: input.campaign_id,
      object: "campaign",
      deleted: true,
    }))

    return new WorkflowResponse(result)
  }
)

export const manageMerchantCampaignPromotionsWorkflow = createWorkflow(
  "manage-merchant-campaign-promotions",
  function (input: ManageMerchantCampaignPromotionsInput) {
    const scope = validateMerchantScopeStep(input)

    assertMerchantOwnsPromotionResourceStep({
      merchant_id: scope.merchant_id,
      resource: "campaign",
      id: input.campaign_id,
    })

    const promotionIds = transform({ input }, ({ input }) => [
      ...(input.add ?? []),
      ...(input.remove ?? []),
    ])

    validateMerchantPromotionIdsStep({
      merchant_id: scope.merchant_id,
      promotion_ids: promotionIds,
    })

    const linkInput = transform({ input }, ({ input }) => ({
      id: input.campaign_id,
      add: Array.from(new Set(input.add ?? [])),
      remove: Array.from(new Set(input.remove ?? [])),
    }))

    addOrRemoveCampaignPromotionsWorkflow.runAsStep({ input: linkInput })

    const campaign = retrieveMerchantCampaignStep({
      merchant_id: scope.merchant_id,
      campaign_id: input.campaign_id,
    })

    return new WorkflowResponse(campaign)
  }
)
