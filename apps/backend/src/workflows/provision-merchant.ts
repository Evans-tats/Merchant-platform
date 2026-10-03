import { Modules } from "@medusajs/framework/utils"
import {
  createWorkflow,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import {
  createApiKeysWorkflow,
  createRemoteLinkStep,
  createSalesChannelsWorkflow,
  createShippingProfilesWorkflow,
  createStockLocationsWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
} from "@medusajs/medusa/core-flows"

import { MERCHANT_MODULE } from "../modules/merchant"
import {
  activateMerchantStep,
  createMerchantDomainStep,
  createMerchantOwnerStep,
  createMerchantPaymentConfigStep,
  createMerchantStep,
  createMerchantThemeStep,
} from "./steps/create-merchant-provisioning-records"
import {
  prepareMerchantProvisioningStep,
  ProvisionMerchantWorkflowInput,
} from "./steps/prepare-merchant-provisioning"

export const provisionMerchantWorkflowId = "provision-merchant"

export const provisionMerchantWorkflow = createWorkflow(
  provisionMerchantWorkflowId,
  function (input: ProvisionMerchantWorkflowInput) {
    const prepared = prepareMerchantProvisioningStep(input)
    const merchant = createMerchantStep({
      name: prepared.name,
      slug: prepared.slug,
    })
    const domain = createMerchantDomainStep({
      merchant_id: merchant.id,
      hostname: prepared.platform_hostname,
    })
    const salesChannels = createSalesChannelsWorkflow.runAsStep({
      input: {
        salesChannelsData: [
          {
            name: prepared.sales_channel_name,
            description: prepared.sales_channel_description,
          },
        ],
      },
    })
    const publishableApiKeys = createApiKeysWorkflow.runAsStep({
      input: {
        api_keys: [
          {
            title: prepared.publishable_api_key_title,
            type: "publishable",
            created_by: prepared.owner_actor_id,
          },
        ],
      },
    })
    const stockLocations = createStockLocationsWorkflow.runAsStep({
      input: {
        locations: [
          {
            name: prepared.stock_location_name,
          },
        ],
      },
    })
    const shippingProfiles = createShippingProfilesWorkflow.runAsStep({
      input: {
        data: [
          {
            name: prepared.shipping_profile_name,
            type: "default",
          },
        ],
      },
    })
    const salesChannel = transform(
      { salesChannels },
      ({ salesChannels }) => salesChannels[0]
    )
    const publishableApiKey = transform(
      { publishableApiKeys },
      ({ publishableApiKeys }) => publishableApiKeys[0]
    )
    const stockLocation = transform(
      { stockLocations },
      ({ stockLocations }) => stockLocations[0]
    )
    const shippingProfile = transform(
      { shippingProfiles },
      ({ shippingProfiles }) => shippingProfiles[0]
    )
    const theme = createMerchantThemeStep({
      merchant_id: merchant.id,
      configuration: prepared.theme_configuration,
    })
    const ownerMembership = createMerchantOwnerStep({
      merchant_id: merchant.id,
      actor_id: prepared.owner_actor_id,
    })
    const paymentConfig = createMerchantPaymentConfigStep({
      merchant_id: merchant.id,
      provider: prepared.payment_provider,
      public_configuration: prepared.payment_public_configuration,
    })
    const links = createRemoteLinkStep([
      {
        [MERCHANT_MODULE]: {
          merchant_id: merchant.id,
        },
        [Modules.SALES_CHANNEL]: {
          sales_channel_id: salesChannel.id,
        },
      },
      {
        [MERCHANT_MODULE]: {
          merchant_id: merchant.id,
        },
        [Modules.STOCK_LOCATION]: {
          stock_location_id: stockLocation.id,
        },
      },
      {
        [MERCHANT_MODULE]: {
          merchant_id: merchant.id,
        },
        [Modules.FULFILLMENT]: {
          shipping_profile_id: shippingProfile.id,
        },
      },
    ])
    const apiKeySalesChannelLink =
      linkSalesChannelsToApiKeyWorkflow.runAsStep({
        input: {
          id: publishableApiKey.id,
          add: [salesChannel.id],
        },
      })
    const stockLocationSalesChannelLink =
      linkSalesChannelsToStockLocationWorkflow.runAsStep({
        input: {
          id: stockLocation.id,
          add: [salesChannel.id],
        },
      })
    const activationInput = transform(
      {
        merchant,
        domain,
        salesChannel,
        publishableApiKey,
        stockLocation,
        shippingProfile,
        theme,
        ownerMembership,
        paymentConfig,
        links,
        apiKeySalesChannelLink,
        stockLocationSalesChannelLink,
      },
      ({ merchant }) => ({
        merchant_id: merchant.id,
      })
    )
    const activeMerchant = activateMerchantStep(activationInput)
    const result = transform(
      {
        merchant: activeMerchant,
        domain,
        salesChannel,
        publishableApiKey,
        stockLocation,
        shippingProfile,
        theme,
        ownerMembership,
        paymentConfig,
      },
      (resources) => resources
    )

    return new WorkflowResponse(result)
  }
)

export type { ProvisionMerchantWorkflowInput }
