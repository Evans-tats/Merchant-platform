import type { CreateCartWorkflowInputDTO } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import {
  createWorkflow,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import {
  createCartWorkflow,
  createRemoteLinkStep,
} from "@medusajs/medusa/core-flows"

import { MERCHANT_MODULE } from "../modules/merchant"
import {
  type MerchantScopeInput,
  validateMerchantCartVariantsStep,
  validateMerchantScopeStep,
} from "./steps/validate-merchant-commerce"

export type CreateMerchantCartInput = MerchantScopeInput & {
  cart: CreateCartWorkflowInputDTO
}

export const createMerchantCartWorkflow = createWorkflow(
  "create-merchant-cart",
  function (input: CreateMerchantCartInput) {
    const scope = validateMerchantScopeStep(input)
    const variantIds = transform({ input }, ({ input }) => {
      return (input.cart.items ?? [])
        .map(({ variant_id }) => variant_id)
        .filter((id): id is string => Boolean(id))
    })

    validateMerchantCartVariantsStep({
      scope,
      variant_ids: variantIds,
    })
    const cartInput = transform(
      { input, scope },
      ({ input, scope }) => ({
        ...input.cart,
        sales_channel_id: scope.sales_channel_id,
      })
    )
    const cart = createCartWorkflow.runAsStep({ input: cartInput })
    const cartLinks = transform({ cart, scope }, ({ cart, scope }) => [
      {
        [MERCHANT_MODULE]: {
          merchant_id: scope.merchant_id,
        },
        [Modules.CART]: {
          cart_id: cart.id,
        },
      },
    ])

    createRemoteLinkStep(cartLinks)

    return new WorkflowResponse(cart)
  }
)
