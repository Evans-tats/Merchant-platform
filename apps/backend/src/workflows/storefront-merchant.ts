import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"

import type { ResolvedMerchantId } from "../services/tenant-resolution"

type StorefrontMerchantInput = {
  merchant_id: ResolvedMerchantId
}

const retrieveStorefrontMerchantStep = createStep(
  "retrieve-storefront-merchant",
  async (input: StorefrontMerchantInput, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "merchant",
      fields: [
        "id",
        "name",
        "slug",
        "status",
        "domains.id",
        "domains.hostname",
        "domains.type",
        "domains.is_primary",
        "themes.id",
        "themes.version",
        "themes.configuration",
        "themes.is_active",
      ],
      filters: {
        id: input.merchant_id,
        status: "active",
      },
    })

    return new StepResponse(data[0])
  }
)

export const retrieveStorefrontMerchantWorkflow = createWorkflow(
  "retrieve-storefront-merchant",
  function (input: StorefrontMerchantInput) {
    const merchant = retrieveStorefrontMerchantStep(input)

    return new WorkflowResponse(merchant)
  }
)
