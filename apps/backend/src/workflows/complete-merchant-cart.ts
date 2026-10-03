import { Modules } from "@medusajs/framework/utils"
import {
  createWorkflow,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import {
  completeCartWorkflow,
  createRemoteLinkStep,
} from "@medusajs/medusa/core-flows"

import { MERCHANT_MODULE } from "../modules/merchant"
import {
  type MerchantScopeInput,
  validateMerchantCartStep,
  validateMerchantCartVariantsStep,
  validateMerchantScopeStep,
} from "./steps/validate-merchant-commerce"

export type CompleteMerchantCartInput = MerchantScopeInput & {
  cart_id: string
}

export const completeMerchantCartWorkflow = createWorkflow(
  "complete-merchant-cart",
  function (input: CompleteMerchantCartInput) {
    const scope = validateMerchantScopeStep(input)
    const variantIds = validateMerchantCartStep({
      scope,
      cart_id: input.cart_id,
    })

    validateMerchantCartVariantsStep({
      scope,
      variant_ids: variantIds,
    })
    const order = completeCartWorkflow.runAsStep({
      input: { id: input.cart_id },
    })
    const orderLinks = transform({ order, scope }, ({ order, scope }) => [
      {
        [MERCHANT_MODULE]: {
          merchant_id: scope.merchant_id,
        },
        [Modules.ORDER]: {
          order_id: order.id,
        },
      },
    ])

    createRemoteLinkStep(orderLinks)

    return new WorkflowResponse(order)
  }
)
