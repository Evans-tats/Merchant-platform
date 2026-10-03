import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { createOrderWorkflow, createRemoteLinkStep } from "@medusajs/medusa/core-flows"

import { MERCHANT_MODULE } from "../modules/merchant"
import {
  type MerchantScopeInput,
  validateMerchantCartVariantsStep,
  validateMerchantScopeStep,
} from "./steps/validate-merchant-commerce"

type CreateMerchantDraftOrderInput = MerchantScopeInput & {
  actor_id: string
  email: string
  items: Array<{ variant_id: string; quantity: number }>
}

const retrieveDraftOrderRegionStep = createStep(
  "retrieve-draft-order-region",
  async (_, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "region",
      fields: ["id", "currency_code", "created_at"],
      pagination: { take: 1, order: { created_at: "ASC" } },
    })
    const region = (data as unknown as Array<{ id: string; currency_code: string }>)[0]

    if (!region) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "Create a Medusa region before creating draft orders"
      )
    }

    return new StepResponse(region)
  }
)

const prepareDraftOrderItemsStep = createStep(
  "prepare-draft-order-items",
  async (
    input: {
      items: Array<{ variant_id: string; quantity: number }>
      currency_code: string
    },
    { container }
  ) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "product_variant",
      fields: ["id", "title", "sku", "prices.*"],
      filters: { id: input.items.map(({ variant_id }) => variant_id) },
    })
    const variants = data as unknown as Array<{
      id: string
      title: string
      sku?: string | null
      prices?: Array<{ amount: number; currency_code: string }>
    }>

    return new StepResponse(input.items.map((item) => {
      const variant = variants.find(({ id }) => id === item.variant_id)
      const price = variant?.prices?.find(
        ({ currency_code }) => currency_code === input.currency_code
      )

      if (!variant || !price) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `Variant ${item.variant_id} has no ${input.currency_code.toUpperCase()} price`
        )
      }

      return {
        variant_id: variant.id,
        title: variant.title,
        variant_sku: variant.sku ?? undefined,
        unit_price: Number(price.amount),
        quantity: item.quantity,
      }
    }))
  }
)

export const createMerchantDraftOrderWorkflow = createWorkflow(
  "create-merchant-draft-order",
  function (input: CreateMerchantDraftOrderInput) {
    const scope = validateMerchantScopeStep(input)
    const variantIds = transform({ input }, ({ input }) =>
      input.items.map(({ variant_id }) => variant_id)
    )
    validateMerchantCartVariantsStep({
      scope,
      variant_ids: variantIds,
    })
    const region = retrieveDraftOrderRegionStep()
    const items = prepareDraftOrderItemsStep({
      items: input.items,
      currency_code: region.currency_code,
    })
    const orderInput = transform(
      { input, scope, region, items },
      ({ input, scope, region, items }) => ({
        region_id: region.id,
        currency_code: region.currency_code,
        sales_channel_id: scope.sales_channel_id,
        status: "draft" as const,
        is_draft_order: true,
        email: input.email,
        metadata: {
          merchant_created_by: input.actor_id,
        },
        items,
      })
    )
    const order = createOrderWorkflow.runAsStep({ input: orderInput })
    const links = transform({ order, scope }, ({ order, scope }) => [{
      [MERCHANT_MODULE]: { merchant_id: scope.merchant_id },
      [Modules.ORDER]: { order_id: order.id },
    }])

    createRemoteLinkStep(links)

    return new WorkflowResponse(order)
  }
)
