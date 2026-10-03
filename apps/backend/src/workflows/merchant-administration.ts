import { createHash, randomBytes, timingSafeEqual } from "crypto"
import { resolveTxt } from "dns/promises"

import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { createInvitesWorkflow } from "@medusajs/medusa/core-flows"

import { MERCHANT_MODULE } from "../modules/merchant"
import MerchantModuleService from "../modules/merchant/service"
import { normalizeHostname } from "../services/tenant-resolution"
import {
  type MerchantScopeInput,
  validateMerchantScopeStep,
} from "./steps/validate-merchant-commerce"

export type CreateMerchantInvitationInput = MerchantScopeInput & {
  email: string
  role: "admin" | "staff"
  invited_by_actor_id: string
}

export type UpdateMerchantMemberInput = MerchantScopeInput & {
  member_id: string
  role?: "owner" | "admin" | "staff"
  status?: "active" | "suspended"
}

export type PublishMerchantThemeInput = MerchantScopeInput & {
  configuration: Record<string, unknown>
}

export type AddMerchantDomainInput = MerchantScopeInput & {
  hostname: string
}

export type VerifyMerchantDomainInput = MerchantScopeInput & {
  domain_id: string
}

export type UpdateMerchantPaymentInput = MerchantScopeInput & {
  provider: "mpesa_stk" | "mpesa_paybill"
  mode: "sandbox" | "production"
  status: "disabled" | "active"
  public_configuration: Record<string, unknown>
  secret_reference?: string | null
}

const updateMerchantStep = createStep(
  "update-merchant",
  async (
    input: { merchant_id: string; name: string },
    { container }
  ) => {
    const merchantService =
      container.resolve<MerchantModuleService>(MERCHANT_MODULE)
    const current = await merchantService.retrieveMerchant(
      input.merchant_id
    )
    const merchant = await merchantService.updateMerchants({
      id: current.id,
      name: input.name.trim(),
    })

    return new StepResponse(merchant, {
      id: current.id,
      name: current.name,
    })
  },
  async (previous, { container }) => {
    if (!previous) {
      return
    }

    const merchantService =
      container.resolve<MerchantModuleService>(MERCHANT_MODULE)
    await merchantService.updateMerchants(previous)
  }
)

const recordMerchantInvitationStep = createStep(
  "record-merchant-invitation",
  async (
    input: {
      merchant_id: string
      invite_id: string
      email: string
      role: "admin" | "staff"
      invited_by_actor_id: string
    },
    { container }
  ) => {
    const merchantService =
      container.resolve<MerchantModuleService>(MERCHANT_MODULE)
    const invitation =
      await merchantService.createMerchantInvitations({
        ...input,
        email: input.email.trim().toLowerCase(),
        status: "pending",
      })

    return new StepResponse(invitation, invitation.id)
  },
  async (invitationId, { container }) => {
    if (!invitationId) {
      return
    }

    const merchantService =
      container.resolve<MerchantModuleService>(MERCHANT_MODULE)
    await merchantService.deleteMerchantInvitations(invitationId)
  }
)

const updateMerchantMemberStep = createStep(
  "update-merchant-member",
  async (input: UpdateMerchantMemberInput, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "merchant",
      fields: [
        "members.id",
        "members.role",
        "members.status",
      ],
      filters: { id: input.merchant_id },
    })
    const merchant = data[0] as unknown as {
      members?: Array<{
        id: string
        role: "owner" | "admin" | "staff"
        status: "invited" | "active" | "suspended"
      }>
    }
    const member = merchant?.members?.find(
      ({ id }) => id === input.member_id
    )

    if (!member) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        "Merchant member not found"
      )
    }

    const removesActiveOwner =
      member.role === "owner" &&
      member.status === "active" &&
      ((input.role && input.role !== "owner") ||
        input.status === "suspended")
    const activeOwnerCount = (merchant.members ?? []).filter(
      ({ role, status }) => role === "owner" && status === "active"
    ).length

    if (removesActiveOwner && activeOwnerCount <= 1) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "A merchant must retain at least one active owner"
      )
    }

    const merchantService =
      container.resolve<MerchantModuleService>(MERCHANT_MODULE)
    const updated = await merchantService.updateMerchantMembers({
      id: member.id,
      role: input.role ?? member.role,
      status: input.status ?? member.status,
    })

    return new StepResponse(updated, {
      id: member.id,
      role: member.role,
      status: member.status,
    })
  },
  async (previous, { container }) => {
    if (!previous) {
      return
    }

    const merchantService =
      container.resolve<MerchantModuleService>(MERCHANT_MODULE)
    await merchantService.updateMerchantMembers(previous)
  }
)

const publishMerchantThemeStep = createStep(
  "publish-merchant-theme",
  async (input: PublishMerchantThemeInput, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "merchant_theme",
      fields: ["id", "version", "is_active"],
      filters: { merchant_id: input.merchant_id },
    })
    const themes = data as unknown as Array<{
      id: string
      version: number
      is_active: boolean
    }>
    const merchantService =
      container.resolve<MerchantModuleService>(MERCHANT_MODULE)
    const activeThemeIds = themes
      .filter(({ is_active }) => is_active)
      .map(({ id }) => id)

    if (activeThemeIds.length) {
      await merchantService.updateMerchantThemes(
        activeThemeIds.map((id) => ({ id, is_active: false }))
      )
    }

    const theme = await merchantService.createMerchantThemes({
      merchant_id: input.merchant_id,
      version: Math.max(0, ...themes.map(({ version }) => version)) + 1,
      configuration: input.configuration,
      is_active: true,
    })

    return new StepResponse(theme, {
      created_theme_id: theme.id,
      active_theme_ids: activeThemeIds,
    })
  },
  async (previous, { container }) => {
    if (!previous) {
      return
    }

    const merchantService =
      container.resolve<MerchantModuleService>(MERCHANT_MODULE)
    await merchantService.deleteMerchantThemes(previous.created_theme_id)

    if (previous.active_theme_ids.length) {
      await merchantService.updateMerchantThemes(
        previous.active_theme_ids.map((id) => ({
          id,
          is_active: true,
        }))
      )
    }
  }
)

const addMerchantDomainStep = createStep(
  "add-merchant-domain",
  async (input: AddMerchantDomainInput, { container }) => {
    const merchantService =
      container.resolve<MerchantModuleService>(MERCHANT_MODULE)
    const verificationToken = randomBytes(32).toString("hex")
    const domain = await merchantService.createMerchantDomains({
      merchant_id: input.merchant_id,
      hostname: normalizeHostname(input.hostname),
      type: "custom",
      status: "pending",
      is_primary: false,
      verification_token_hash: createHash("sha256")
        .update(verificationToken)
        .digest("hex"),
    })

    return new StepResponse(
      { domain, verification_token: verificationToken },
      domain.id
    )
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

const verifyMerchantDomainStep = createStep(
  "verify-merchant-domain",
  async (input: VerifyMerchantDomainInput, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "merchant_domain",
      fields: [
        "id",
        "merchant_id",
        "hostname",
        "type",
        "status",
        "verification_token_hash",
      ],
      filters: {
        id: input.domain_id,
        merchant_id: input.merchant_id,
      },
    })
    const domain = data[0] as unknown as
      | {
          id: string
          hostname: string
          type: string
          status: "pending" | "verified" | "active" | "disabled"
          verification_token_hash?: string | null
        }
      | undefined

    if (
      !domain ||
      domain.type !== "custom" ||
      !domain.verification_token_hash ||
      !["pending", "verified"].includes(domain.status)
    ) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        "Custom domain verification not found"
      )
    }

    let records: string[][]

    try {
      records = await resolveTxt(
        "_merchant-verification." + domain.hostname
      )
    } catch {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Merchant verification DNS TXT record was not found"
      )
    }

    const expectedHash = Buffer.from(
      domain.verification_token_hash,
      "hex"
    )
    const verified = records.some((parts) => {
      const value = parts
        .join("")
        .replace(/^merchant-verification=/, "")
        .trim()
      const actualHash = createHash("sha256").update(value).digest()

      return (
        actualHash.length === expectedHash.length &&
        timingSafeEqual(actualHash, expectedHash)
      )
    })

    if (!verified) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Merchant verification DNS TXT record does not match"
      )
    }

    const merchantService =
      container.resolve<MerchantModuleService>(MERCHANT_MODULE)
    const updated = await merchantService.updateMerchantDomains({
      id: domain.id,
      status: "active",
    })

    return new StepResponse(updated, {
      id: domain.id,
      status: domain.status,
    })
  },
  async (previous, { container }) => {
    if (!previous) {
      return
    }

    const merchantService =
      container.resolve<MerchantModuleService>(MERCHANT_MODULE)
    await merchantService.updateMerchantDomains(previous)
  }
)

const updateMerchantPaymentStep = createStep(
  "update-merchant-payment",
  async (input: UpdateMerchantPaymentInput, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "merchant_payment_config",
      fields: ["*"],
      filters: {
        merchant_id: input.merchant_id,
        provider: input.provider,
        mode: input.mode,
      },
    })
    const existing = data[0] as unknown as
      | (Record<string, unknown> & { id: string })
      | undefined
    const merchantService =
      container.resolve<MerchantModuleService>(MERCHANT_MODULE)
    const values = {
      provider: input.provider,
      mode: input.mode,
      status: input.status,
      public_configuration: input.public_configuration,
      secret_reference:
        input.secret_reference === undefined
          ? (existing?.secret_reference as string | null | undefined) ??
            null
          : input.secret_reference,
    }
    const paymentConfig = existing
      ? await merchantService.updateMerchantPaymentConfigs({
          id: existing.id,
          ...values,
        })
      : await merchantService.createMerchantPaymentConfigs({
          merchant_id: input.merchant_id,
          ...values,
        })

    return new StepResponse(paymentConfig, {
      created_id: existing ? undefined : paymentConfig.id,
      previous: existing,
    })
  },
  async (compensation, { container }) => {
    if (!compensation) {
      return
    }

    const merchantService =
      container.resolve<MerchantModuleService>(MERCHANT_MODULE)

    if (compensation.created_id) {
      await merchantService.deleteMerchantPaymentConfigs(
        compensation.created_id
      )
    } else if (compensation.previous) {
      await merchantService.updateMerchantPaymentConfigs(
        compensation.previous as { id: string }
      )
    }
  }
)

export const updateMerchantDetailsWorkflow = createWorkflow(
  "update-merchant-details",
  function (input: MerchantScopeInput & { name: string }) {
    const scope = validateMerchantScopeStep(input)
    const merchant = updateMerchantStep({
      merchant_id: scope.merchant_id,
      name: input.name,
    })

    return new WorkflowResponse(merchant)
  }
)

export const createMerchantInvitationWorkflow = createWorkflow(
  "create-merchant-invitation",
  function (input: CreateMerchantInvitationInput) {
    const scope = validateMerchantScopeStep(input)
    const invites = createInvitesWorkflow.runAsStep({
      input: {
        invites: [
          {
            email: input.email,
            metadata: {
              merchant_id: scope.merchant_id,
              merchant_role: input.role,
            },
          },
        ],
      },
    })
    const recordInput = transform(
      { input, scope, invites },
      ({ input, scope, invites }) => ({
        merchant_id: scope.merchant_id,
        invite_id: invites[0].id,
        email: invites[0].email,
        role: input.role,
        invited_by_actor_id: input.invited_by_actor_id,
      })
    )
    const invitation = recordMerchantInvitationStep(recordInput)

    return new WorkflowResponse(invitation)
  }
)

export const updateMerchantMemberWorkflow = createWorkflow(
  "update-merchant-member",
  function (input: UpdateMerchantMemberInput) {
    validateMerchantScopeStep(input)
    const member = updateMerchantMemberStep(input)

    return new WorkflowResponse(member)
  }
)

export const publishMerchantThemeWorkflow = createWorkflow(
  "publish-merchant-theme",
  function (input: PublishMerchantThemeInput) {
    validateMerchantScopeStep(input)
    const theme = publishMerchantThemeStep(input)

    return new WorkflowResponse(theme)
  }
)

export const addMerchantDomainWorkflow = createWorkflow(
  "add-merchant-domain",
  function (input: AddMerchantDomainInput) {
    validateMerchantScopeStep(input)
    const result = addMerchantDomainStep(input)

    return new WorkflowResponse(result)
  }
)

export const verifyMerchantDomainWorkflow = createWorkflow(
  "verify-merchant-domain",
  function (input: VerifyMerchantDomainInput) {
    validateMerchantScopeStep(input)
    const domain = verifyMerchantDomainStep(input)

    return new WorkflowResponse(domain)
  }
)

export const updateMerchantPaymentWorkflow = createWorkflow(
  "update-merchant-payment",
  function (input: UpdateMerchantPaymentInput) {
    validateMerchantScopeStep(input)
    const paymentConfig = updateMerchantPaymentStep(input)

    return new WorkflowResponse(paymentConfig)
  }
)
