import type { InferTypeOf, MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"

import { MERCHANT_MODULE } from "../../modules/merchant"
import MerchantModuleService from "../../modules/merchant/service"
import { MPESA_ONBOARDING_MODULE } from "../../modules/mpesa-onboarding"
import OnboardingSession from "../../modules/mpesa-onboarding/models/onboarding-session"
import MpesaOnboardingModuleService from "../../modules/mpesa-onboarding/service"
import { MPESA_REGISTRY_MODULE } from "../../modules/mpesa-registry"
import MpesaRegistryModuleService from "../../modules/mpesa-registry/service"
import {
  maskMsisdn,
  MAX_ONBOARDING_PRODUCTS,
  isReservedStoreSlug,
  type MpesaAccountType,
  type OnboardingAnswers,
  type OnboardingChannel,
  type OnboardingLanguage,
  type OnboardingStep,
  slugify,
  VERIFIED_STEPS,
} from "../../services/mpesa-onboarding/parsing"
import {
  CODE_TTL_MS,
  deliverVerificationCode,
  generateVerificationCode,
  hashVerificationCode,
  LOCK_DURATION_MS,
  MAX_CODE_ATTEMPTS,
  MAX_LOOKUP_ATTEMPTS,
  verificationCodeMatches,
} from "../../services/mpesa-onboarding/verification-code"

export type OnboardingSessionRecord = InferTypeOf<typeof OnboardingSession>

type SessionScope = {
  session_id: string
  msisdn: string
}

type SessionSnapshot = Partial<OnboardingSessionRecord> & { id: string }

const ENGINE_SETTABLE_STEPS: OnboardingStep[] = [
  "language",
  "terms",
  "account_type",
  "account_number",
  ...VERIFIED_STEPS,
]

const snapshot = (session: OnboardingSessionRecord): SessionSnapshot => ({
  id: session.id,
  status: session.status,
  step: session.step,
  language: session.language,
  answers: session.answers,
  account_type: session.account_type,
  account_number: session.account_number,
  registered_name: session.registered_name,
  verified_at: session.verified_at,
  otp_hash: session.otp_hash,
  otp_expires_at: session.otp_expires_at,
  otp_attempts: session.otp_attempts,
  lookup_attempts: session.lookup_attempts,
  locked_until: session.locked_until,
  merchant_id: session.merchant_id,
})

const restoreSession = async (
  previous: SessionSnapshot | undefined,
  container: MedusaContainer
) => {
  if (!previous) {
    return
  }

  const service = container.resolve<MpesaOnboardingModuleService>(
    MPESA_ONBOARDING_MODULE
  )
  await service.updateOnboardingSessions(previous)
}

async function loadActiveSession(
  service: MpesaOnboardingModuleService,
  scope: SessionScope
) {
  const session = await service.retrieveOnboardingSession(scope.session_id)

  // Sessions are bound to the phone number that started them, so one caller
  // can never drive another caller's onboarding.
  if (session.msisdn !== scope.msisdn) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "Onboarding session not found"
    )
  }

  if (session.status !== "active") {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      `Onboarding session is ${session.status}`
    )
  }

  return session
}

const lockUpdate = () => ({
  status: "locked" as const,
  locked_until: new Date(Date.now() + LOCK_DURATION_MS),
  otp_hash: null,
  otp_expires_at: null,
})

export const getOrCreateMpesaOnboardingSessionStep = createStep(
  "get-or-create-mpesa-onboarding-session",
  async (
    input: { msisdn: string; channel: OnboardingChannel },
    { container }
  ) => {
    const service = container.resolve<MpesaOnboardingModuleService>(
      MPESA_ONBOARDING_MODULE
    )
    const [latest] = await service.listOnboardingSessions(
      { msisdn: input.msisdn, status: ["active", "locked"] },
      { take: 1, order: { created_at: "DESC" } }
    )
    const stillLocked =
      latest?.status === "locked" &&
      latest.locked_until &&
      new Date(latest.locked_until).getTime() > Date.now()

    if (latest && (latest.status === "active" || stillLocked)) {
      return new StepResponse(latest, null as string | null)
    }

    const created = await service.createOnboardingSessions({
      msisdn: input.msisdn,
      channel: input.channel,
    })

    return new StepResponse(created, created.id as string | null)
  },
  async (createdId, { container }) => {
    if (!createdId) {
      return
    }

    const service = container.resolve<MpesaOnboardingModuleService>(
      MPESA_ONBOARDING_MODULE
    )
    await service.deleteOnboardingSessions(createdId)
  }
)

export type UpdateOnboardingSessionInput = SessionScope & {
  step?: OnboardingStep
  language?: OnboardingLanguage
  answers?: OnboardingAnswers
  reset?: boolean
}

export const updateMpesaOnboardingSessionStep = createStep(
  "update-mpesa-onboarding-session",
  async (input: UpdateOnboardingSessionInput, { container }) => {
    const service = container.resolve<MpesaOnboardingModuleService>(
      MPESA_ONBOARDING_MODULE
    )
    const session = await loadActiveSession(service, input)

    if (input.reset) {
      // Attempt counters survive a restart so it can't reset rate limits.
      const updated = await service.updateOnboardingSessions({
        id: session.id,
        step: "language",
        answers: {},
        account_type: null,
        account_number: null,
        registered_name: null,
        verified_at: null,
        otp_hash: null,
        otp_expires_at: null,
      })

      return new StepResponse(updated, snapshot(session))
    }

    if (input.step && !ENGINE_SETTABLE_STEPS.includes(input.step)) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `The ${input.step} step is set by verification, not by the conversation`
      )
    }

    if (input.step && VERIFIED_STEPS.includes(input.step) && !session.verified_at) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "Confirm ownership of the M-PESA account before setting up the store"
      )
    }

    if ((input.answers?.products?.length ?? 0) > MAX_ONBOARDING_PRODUCTS) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Add up to ${MAX_ONBOARDING_PRODUCTS} products during onboarding`
      )
    }

    const updated = await service.updateOnboardingSessions({
      id: session.id,
      ...(input.step && { step: input.step }),
      ...(input.language && { language: input.language }),
      ...(input.answers && { answers: input.answers }),
    })

    return new StepResponse(updated, snapshot(session))
  },
  async (previous, { container }) => restoreSession(previous, container)
)

export type IssueOwnershipCodeInput = SessionScope & {
  account_type: MpesaAccountType
  account_number?: string
}

export type IssueOwnershipCodeResult =
  | { status: "sent"; sent_to: string }
  | { status: "not_found"; attempts_left: number }
  | { status: "locked" }

export const issueMpesaOwnershipCodeStep = createStep(
  "issue-mpesa-ownership-code",
  async (input: IssueOwnershipCodeInput, { container }) => {
    const service = container.resolve<MpesaOnboardingModuleService>(
      MPESA_ONBOARDING_MODULE
    )
    const registry = container.resolve<MpesaRegistryModuleService>(
      MPESA_REGISTRY_MODULE
    )
    const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
    const session = await loadActiveSession(service, input)
    const previous = snapshot(session)

    if (session.verified_at) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "This session is already verified"
      )
    }

    const lookupAttempts = session.lookup_attempts + 1
    if (lookupAttempts > MAX_LOOKUP_ATTEMPTS) {
      await service.updateOnboardingSessions({ id: session.id, ...lockUpdate() })
      return new StepResponse<IssueOwnershipCodeResult, SessionSnapshot>(
        { status: "locked" },
        previous
      )
    }

    // A Pochi la Biashara lives on the owner's own line, so it must match the
    // number the merchant is talking to us from.
    const accountNumber =
      input.account_type === "pochi" ? session.msisdn : input.account_number
    const account = accountNumber
      ? await registry.findAccount(input.account_type, accountNumber)
      : null
    const ownerMatches =
      input.account_type !== "pochi" || account?.owner_msisdn === session.msisdn

    // The same answer for "no such account" and "not eligible" so the lookup
    // can't be used to discover which numbers exist.
    if (!account || account.kyc_status !== "verified" || !ownerMatches) {
      await service.updateOnboardingSessions({
        id: session.id,
        lookup_attempts: lookupAttempts,
      })
      return new StepResponse<IssueOwnershipCodeResult, SessionSnapshot>(
        {
          status: "not_found",
          attempts_left: MAX_LOOKUP_ATTEMPTS - lookupAttempts,
        },
        previous
      )
    }

    const code = generateVerificationCode()
    await service.updateOnboardingSessions({
      id: session.id,
      step: "otp",
      lookup_attempts: lookupAttempts,
      account_type: input.account_type,
      account_number: account.account_number,
      otp_hash: hashVerificationCode(session.id, code),
      otp_expires_at: new Date(Date.now() + CODE_TTL_MS),
      otp_attempts: 0,
    })
    // The code goes to the phone registered on the account, not to whoever
    // typed the number. That is what proves ownership.
    deliverVerificationCode(logger, { to_msisdn: account.owner_msisdn, code })

    return new StepResponse<IssueOwnershipCodeResult, SessionSnapshot>(
      { status: "sent", sent_to: maskMsisdn(account.owner_msisdn) },
      previous
    )
  },
  async (previous, { container }) => restoreSession(previous, container)
)

export type VerifyOwnershipCodeResult =
  | { status: "verified"; registered_name: string }
  | { status: "invalid"; attempts_left: number }
  | { status: "expired" }
  | { status: "already_claimed" }
  | { status: "locked" }

export const verifyMpesaOwnershipCodeStep = createStep(
  "verify-mpesa-ownership-code",
  async (input: SessionScope & { code: string }, { container }) => {
    const service = container.resolve<MpesaOnboardingModuleService>(
      MPESA_ONBOARDING_MODULE
    )
    const registry = container.resolve<MpesaRegistryModuleService>(
      MPESA_REGISTRY_MODULE
    )
    const session = await loadActiveSession(service, input)
    const previous = snapshot(session)

    if (
      session.step !== "otp" ||
      !session.otp_hash ||
      !session.otp_expires_at ||
      !session.account_type ||
      !session.account_number
    ) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "Request a verification code first"
      )
    }

    if (new Date(session.otp_expires_at).getTime() < Date.now()) {
      return new StepResponse<VerifyOwnershipCodeResult, SessionSnapshot>(
        { status: "expired" },
        previous
      )
    }

    if (!verificationCodeMatches(session.id, input.code, session.otp_hash)) {
      const attempts = session.otp_attempts + 1
      if (attempts >= MAX_CODE_ATTEMPTS) {
        await service.updateOnboardingSessions({
          id: session.id,
          otp_attempts: attempts,
          ...lockUpdate(),
        })
        return new StepResponse<VerifyOwnershipCodeResult, SessionSnapshot>(
          { status: "locked" },
          previous
        )
      }

      await service.updateOnboardingSessions({
        id: session.id,
        otp_attempts: attempts,
      })
      return new StepResponse<VerifyOwnershipCodeResult, SessionSnapshot>(
        { status: "invalid", attempts_left: MAX_CODE_ATTEMPTS - attempts },
        previous
      )
    }

    const [account, [claim]] = await Promise.all([
      registry.findAccount(session.account_type, session.account_number),
      service.listMpesaAccountClaims(
        {
          account_type: session.account_type,
          account_number: session.account_number,
        },
        { take: 1 }
      ),
    ])

    // Only the verified owner learns that the account already has a store.
    if (claim || !account) {
      await service.updateOnboardingSessions({
        id: session.id,
        step: "account_type",
        account_type: null,
        account_number: null,
        otp_hash: null,
        otp_expires_at: null,
      })
      return new StepResponse<VerifyOwnershipCodeResult, SessionSnapshot>(
        { status: "already_claimed" },
        previous
      )
    }

    await service.updateOnboardingSessions({
      id: session.id,
      step: "store_name",
      verified_at: new Date(),
      registered_name: account.registered_name,
      otp_hash: null,
      otp_expires_at: null,
    })

    return new StepResponse<VerifyOwnershipCodeResult, SessionSnapshot>(
      { status: "verified", registered_name: account.registered_name },
      previous
    )
  },
  async (previous, { container }) => restoreSession(previous, container)
)

export type PreparedOnboardingCompletion = {
  session_id: string
  msisdn: string
  store_name: string
  category: string
  slug: string
  hostname: string
  login_email: string
  existing_owner_id: string | null
  account_type: MpesaAccountType
  account_number: string
  registered_name: string
  verified_at: Date
  products: Array<{ title: string; price: number }>
}

const platformDomain = () =>
  process.env.MERCHANT_PLATFORM_DOMAIN?.trim() || "localhost"
const loginEmailDomain = () =>
  process.env.MPESA_ONBOARDING_LOGIN_DOMAIN?.trim() || "merchants.mpesa.local"

export const prepareMpesaOnboardingCompletionStep = createStep(
  "prepare-mpesa-onboarding-completion",
  async (input: SessionScope, { container }) => {
    const service = container.resolve<MpesaOnboardingModuleService>(
      MPESA_ONBOARDING_MODULE
    )
    const merchantService =
      container.resolve<MerchantModuleService>(MERCHANT_MODULE)
    const userService = container.resolve(Modules.USER)
    const session = await loadActiveSession(service, input)
    const answers = session.answers as OnboardingAnswers

    if (
      !session.verified_at ||
      !session.account_type ||
      !session.account_number ||
      !session.registered_name
    ) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "Confirm ownership of the M-PESA account before publishing"
      )
    }

    if (session.step !== "review") {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "Finish the store details before publishing"
      )
    }

    if (!answers.store_name || !answers.category || !answers.products?.length) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "The store name, category, and at least one product are required"
      )
    }

    const [existingClaim] = await service.listMpesaAccountClaims(
      {
        account_type: session.account_type,
        account_number: session.account_number,
      },
      { take: 1 }
    )
    if (existingClaim) {
      throw new MedusaError(
        MedusaError.Types.DUPLICATE_ERROR,
        "This M-PESA account is already linked to a store"
      )
    }

    const baseSlug = slugify(answers.store_name) || "store"
    let slug = baseSlug
    for (let suffix = 2; ; suffix += 1) {
      const [[merchant], [domain]] = await Promise.all([
        merchantService.listMerchants({ slug }, { take: 1 }),
        merchantService.listMerchantDomains(
          { hostname: `${slug}.${platformDomain()}` },
          { take: 1 }
        ),
      ])
      if (!isReservedStoreSlug(slug) && !merchant && !domain) break
      slug = `${baseSlug}-${suffix}`
    }

    const loginEmail = `${session.msisdn}@${loginEmailDomain()}`
    const [existingOwner] = await userService.listUsers(
      { email: loginEmail },
      { take: 1 }
    )

    return new StepResponse<PreparedOnboardingCompletion>({
      session_id: session.id,
      msisdn: session.msisdn,
      store_name: answers.store_name,
      category: answers.category,
      slug,
      hostname: `${slug}.${platformDomain()}`,
      login_email: loginEmail,
      existing_owner_id: existingOwner?.id ?? null,
      account_type: session.account_type,
      account_number: session.account_number,
      registered_name: session.registered_name,
      verified_at: session.verified_at,
      products: answers.products,
    })
  }
)

export const registerMpesaMerchantOwnerLoginStep = createStep(
  "register-mpesa-merchant-owner-login",
  async (
    input: { email: string; password: string; user_id: string },
    { container }
  ) => {
    const authService = container.resolve(Modules.AUTH)
    const { authIdentity, error } = await authService.register("emailpass", {
      body: { email: input.email, password: input.password },
    })

    if (error || !authIdentity) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `Could not create the store owner login: ${error ?? "unknown error"}`
      )
    }

    await authService.updateAuthIdentities({
      id: authIdentity.id,
      app_metadata: { user_id: input.user_id },
    })

    return new StepResponse({ id: authIdentity.id }, authIdentity.id)
  },
  async (authIdentityId, { container }) => {
    if (!authIdentityId) {
      return
    }

    const authService = container.resolve(Modules.AUTH)
    await authService.deleteAuthIdentities([authIdentityId])
  }
)

export const createMpesaAccountClaimStep = createStep(
  "create-mpesa-account-claim",
  async (
    input: {
      account_type: MpesaAccountType
      account_number: string
      registered_name: string
      store_name: string
      owner_msisdn: string
      session_id: string
      verified_at: Date
    },
    { container }
  ) => {
    const service = container.resolve<MpesaOnboardingModuleService>(
      MPESA_ONBOARDING_MODULE
    )
    const claim = await service.createMpesaAccountClaims(input)

    return new StepResponse(claim, claim.id)
  },
  async (claimId, { container }) => {
    if (!claimId) {
      return
    }

    const service = container.resolve<MpesaOnboardingModuleService>(
      MPESA_ONBOARDING_MODULE
    )
    await service.deleteMpesaAccountClaims(claimId)
  }
)

export const completeMpesaOnboardingSessionStep = createStep(
  "complete-mpesa-onboarding-session",
  async (input: SessionScope & { merchant_id: string }, { container }) => {
    const service = container.resolve<MpesaOnboardingModuleService>(
      MPESA_ONBOARDING_MODULE
    )
    const session = await loadActiveSession(service, input)
    const updated = await service.updateOnboardingSessions({
      id: session.id,
      status: "completed",
      step: "completed",
      merchant_id: input.merchant_id,
    })

    return new StepResponse(updated, snapshot(session))
  },
  async (previous, { container }) => restoreSession(previous, container)
)
