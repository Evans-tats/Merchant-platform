import { MedusaError, Modules } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"

import { normalizeHostname } from "../../services/tenant-resolution"
import { MERCHANT_MODULE } from "../../modules/merchant"
import MerchantModuleService from "../../modules/merchant/service"

export type MerchantPaymentProvider = "mpesa_stk" | "mpesa_paybill"

export type ProvisionMerchantWorkflowInput = {
  name: string
  slug: string
  platform_hostname: string
  owner_actor_id: string
  theme_configuration?: Record<string, unknown>
  payment_provider?: MerchantPaymentProvider
  payment_public_configuration?: Record<string, unknown>
}

export type PreparedMerchantProvisioning = {
  name: string
  slug: string
  platform_hostname: string
  owner_actor_id: string
  theme_configuration: Record<string, unknown>
  payment_provider: MerchantPaymentProvider
  payment_public_configuration: Record<string, unknown>
  sales_channel_name: string
  sales_channel_description: string
  publishable_api_key_title: string
  stock_location_name: string
  shipping_profile_name: string
}

const merchantSlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export const prepareMerchantProvisioningStep = createStep(
  "prepare-merchant-provisioning",
  async (
    input: ProvisionMerchantWorkflowInput,
    { container }
  ) => {
    const name = input.name?.trim()
    const slug = input.slug?.trim().toLowerCase()
    const ownerActorId = input.owner_actor_id?.trim()

    if (!name) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Merchant name is required"
      )
    }

    if (!slug || !merchantSlugPattern.test(slug)) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Merchant slug must contain lowercase letters, numbers, and single hyphens only"
      )
    }

    if (!ownerActorId) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Owner actor ID is required"
      )
    }

    if (
      input.payment_provider &&
      !["mpesa_stk", "mpesa_paybill"].includes(input.payment_provider)
    ) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Unsupported merchant payment provider"
      )
    }

    const platformHostname = normalizeHostname(input.platform_hostname)
    const userService = container.resolve(Modules.USER)
    const merchantService =
      container.resolve<MerchantModuleService>(MERCHANT_MODULE)
    const [existingMerchants, existingDomains] = await Promise.all([
      merchantService.listMerchants({ slug }),
      merchantService.listMerchantDomains({
        hostname: platformHostname,
      }),
      userService.retrieveUser(ownerActorId),
    ])

    if (existingMerchants.length) {
      throw new MedusaError(
        MedusaError.Types.DUPLICATE_ERROR,
        "A merchant with this slug already exists"
      )
    }

    if (existingDomains.length) {
      throw new MedusaError(
        MedusaError.Types.DUPLICATE_ERROR,
        "A merchant domain with this hostname already exists"
      )
    }

    return new StepResponse<PreparedMerchantProvisioning>({
      name,
      slug,
      platform_hostname: platformHostname,
      owner_actor_id: ownerActorId,
      theme_configuration: input.theme_configuration ?? {
        branding: {
          name,
        },
        pages: {},
      },
      payment_provider: input.payment_provider ?? "mpesa_stk",
      payment_public_configuration: input.payment_public_configuration ?? {},
      sales_channel_name: name,
      sales_channel_description: `Primary storefront channel for ${slug}`,
      publishable_api_key_title: `${name} Storefront`,
      stock_location_name: `${name} Default Stock Location`,
      shipping_profile_name: `${name} Default Shipping Profile`,
    })
  }
)
