import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"

import { MERCHANT_MODULE } from "../../modules/merchant"
import MerchantModuleService from "../../modules/merchant/service"
import { MerchantPaymentProvider } from "./prepare-merchant-provisioning"

type CreateMerchantStepInput = {
  name: string
  slug: string
}

type CreateMerchantDomainStepInput = {
  merchant_id: string
  hostname: string
}

type CreateMerchantThemeStepInput = {
  merchant_id: string
  configuration: Record<string, unknown>
}

type CreateMerchantOwnerStepInput = {
  merchant_id: string
  actor_id: string
}

type CreateMerchantPaymentConfigStepInput = {
  merchant_id: string
  provider: MerchantPaymentProvider
  public_configuration?: Record<string, unknown>
}

type ActivateMerchantStepInput = {
  merchant_id: string
}

type RestoreMerchantStatus = {
  merchant_id: string
  status: "draft" | "active" | "suspended"
}

export const createMerchantStep = createStep(
  "create-merchant",
  async (input: CreateMerchantStepInput, { container }) => {
    const merchantService =
      container.resolve<MerchantModuleService>(MERCHANT_MODULE)
    const merchant = await merchantService.createMerchants({
      name: input.name,
      slug: input.slug,
      status: "draft",
    })

    return new StepResponse(merchant, merchant.id)
  },
  async (merchantId, { container }) => {
    if (!merchantId) {
      return
    }

    const merchantService =
      container.resolve<MerchantModuleService>(MERCHANT_MODULE)
    await merchantService.deleteMerchants(merchantId)
  }
)

export const createMerchantDomainStep = createStep(
  "create-merchant-domain",
  async (input: CreateMerchantDomainStepInput, { container }) => {
    const merchantService =
      container.resolve<MerchantModuleService>(MERCHANT_MODULE)
    const domain = await merchantService.createMerchantDomains({
      merchant_id: input.merchant_id,
      hostname: input.hostname,
      type: "platform",
      status: "active",
      is_primary: true,
      verification_token_hash: null,
    })

    return new StepResponse(domain, domain.id)
  },
  async (domainId, { container }) => {
    if (!domainId) {
      return
    }

    const merchantService =
      container.resolve<MerchantModuleService>(MERCHANT_MODULE)
    await merchantService.deleteMerchantDomains(domainId)
  }
)

export const createMerchantThemeStep = createStep(
  "create-merchant-theme",
  async (input: CreateMerchantThemeStepInput, { container }) => {
    const merchantService =
      container.resolve<MerchantModuleService>(MERCHANT_MODULE)
    const theme = await merchantService.createMerchantThemes({
      merchant_id: input.merchant_id,
      version: 1,
      configuration: input.configuration,
      is_active: true,
    })

    return new StepResponse(theme, theme.id)
  },
  async (themeId, { container }) => {
    if (!themeId) {
      return
    }

    const merchantService =
      container.resolve<MerchantModuleService>(MERCHANT_MODULE)
    await merchantService.deleteMerchantThemes(themeId)
  }
)

export const createMerchantOwnerStep = createStep(
  "create-merchant-owner",
  async (input: CreateMerchantOwnerStepInput, { container }) => {
    const merchantService =
      container.resolve<MerchantModuleService>(MERCHANT_MODULE)
    const member = await merchantService.createMerchantMembers({
      merchant_id: input.merchant_id,
      actor_id: input.actor_id,
      role: "owner",
      status: "active",
    })

    return new StepResponse(member, member.id)
  },
  async (memberId, { container }) => {
    if (!memberId) {
      return
    }

    const merchantService =
      container.resolve<MerchantModuleService>(MERCHANT_MODULE)
    await merchantService.deleteMerchantMembers(memberId)
  }
)

export const createMerchantPaymentConfigStep = createStep(
  "create-merchant-payment-config",
  async (input: CreateMerchantPaymentConfigStepInput, { container }) => {
    const merchantService =
      container.resolve<MerchantModuleService>(MERCHANT_MODULE)
    const paymentConfig =
      await merchantService.createMerchantPaymentConfigs({
        merchant_id: input.merchant_id,
        provider: input.provider,
        mode: "sandbox",
        status: "disabled",
        public_configuration: input.public_configuration ?? {},
        secret_reference: null,
      })

    return new StepResponse(paymentConfig, paymentConfig.id)
  },
  async (paymentConfigId, { container }) => {
    if (!paymentConfigId) {
      return
    }

    const merchantService =
      container.resolve<MerchantModuleService>(MERCHANT_MODULE)
    await merchantService.deleteMerchantPaymentConfigs(paymentConfigId)
  }
)

export const activateMerchantStep = createStep(
  "activate-merchant",
  async (input: ActivateMerchantStepInput, { container }) => {
    const merchantService =
      container.resolve<MerchantModuleService>(MERCHANT_MODULE)
    const merchant = await merchantService.retrieveMerchant(
      input.merchant_id
    )
    const updatedMerchant = await merchantService.updateMerchants({
      id: merchant.id,
      status: "active",
    })

    return new StepResponse<
      typeof updatedMerchant,
      RestoreMerchantStatus
    >(updatedMerchant, {
      merchant_id: merchant.id,
      status: merchant.status,
    })
  },
  async (previous, { container }) => {
    if (!previous) {
      return
    }

    const merchantService =
      container.resolve<MerchantModuleService>(MERCHANT_MODULE)
    await merchantService.updateMerchants({
      id: previous.merchant_id,
      status: previous.status,
    })
  }
)
