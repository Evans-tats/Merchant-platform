import {
  createWorkflow,
  transform,
  when,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import {
  createRemoteLinkStep,
  createUsersWorkflow,
} from "@medusajs/medusa/core-flows"

import { MERCHANT_MODULE } from "../modules/merchant"
import { MPESA_ONBOARDING_MODULE } from "../modules/mpesa-onboarding"
import {
  type OnboardingChannel,
  slugify,
} from "../services/mpesa-onboarding/parsing"
import { createMerchantProductsWorkflow } from "./merchant-catalog"
import { provisionMerchantWorkflow } from "./provision-merchant"
import {
  completeMpesaOnboardingSessionStep,
  createMpesaAccountClaimStep,
  getOrCreateMpesaOnboardingSessionStep,
  type IssueOwnershipCodeInput,
  issueMpesaOwnershipCodeStep,
  prepareMpesaOnboardingCompletionStep,
  registerMpesaMerchantOwnerLoginStep,
  type UpdateOnboardingSessionInput,
  updateMpesaOnboardingSessionStep,
  verifyMpesaOwnershipCodeStep,
} from "./steps/mpesa-onboarding"

export const startMpesaOnboardingSessionWorkflow = createWorkflow(
  "start-mpesa-onboarding-session",
  function (input: { msisdn: string; channel: OnboardingChannel }) {
    const session = getOrCreateMpesaOnboardingSessionStep(input)

    return new WorkflowResponse(session)
  }
)

export const updateMpesaOnboardingSessionWorkflow = createWorkflow(
  "update-mpesa-onboarding-session",
  function (input: UpdateOnboardingSessionInput) {
    const session = updateMpesaOnboardingSessionStep(input)

    return new WorkflowResponse(session)
  }
)

export const requestMpesaOwnershipCodeWorkflow = createWorkflow(
  "request-mpesa-ownership-code",
  function (input: IssueOwnershipCodeInput) {
    const result = issueMpesaOwnershipCodeStep(input)

    return new WorkflowResponse(result)
  }
)

export const verifyMpesaOwnershipCodeWorkflow = createWorkflow(
  "verify-mpesa-ownership-code",
  function (input: { session_id: string; msisdn: string; code: string }) {
    const result = verifyMpesaOwnershipCodeStep(input)

    return new WorkflowResponse(result)
  }
)

export type CompleteMpesaOnboardingInput = {
  session_id: string
  msisdn: string
  // Only used when this phone number has no store owner login yet.
  password: string
}

export const completeMpesaOnboardingWorkflow = createWorkflow(
  "complete-mpesa-onboarding",
  function (input: CompleteMpesaOnboardingInput) {
    const prepared = prepareMpesaOnboardingCompletionStep({
      session_id: input.session_id,
      msisdn: input.msisdn,
    })

    const createdOwner = when(
      "create-mpesa-merchant-owner",
      { prepared },
      ({ prepared }) => !prepared.existing_owner_id
    ).then(() => {
      const users = createUsersWorkflow.runAsStep({
        input: transform({ prepared }, ({ prepared }) => ({
          users: [
            {
              email: prepared.login_email,
              first_name: prepared.store_name,
            },
          ],
        })),
      })
      const owner = transform({ users }, ({ users }) => users[0])

      registerMpesaMerchantOwnerLoginStep(
        transform({ prepared, owner, input }, ({ prepared, owner, input }) => ({
          email: prepared.login_email,
          password: input.password,
          user_id: owner.id,
        }))
      )

      return owner
    })

    const ownerId = transform(
      { prepared, createdOwner },
      ({ prepared, createdOwner }) =>
        prepared.existing_owner_id ?? createdOwner!.id
    )

    const provisioned = provisionMerchantWorkflow.runAsStep({
      input: transform({ prepared, ownerId }, ({ prepared, ownerId }) => ({
        name: prepared.store_name,
        slug: prepared.slug,
        platform_hostname: prepared.hostname,
        owner_actor_id: ownerId,
        theme_configuration: {
          branding: { name: prepared.store_name },
          category: prepared.category,
          pages: {},
        },
        // Paybill customers pay with an account number; Till and Pochi use
        // Buy Goods style STK push. Stays disabled until Daraja keys are set.
        payment_provider:
          prepared.account_type === "paybill"
            ? ("mpesa_paybill" as const)
            : ("mpesa_stk" as const),
        payment_public_configuration: {
          account_type: prepared.account_type,
          account_number: prepared.account_number,
          registered_name: prepared.registered_name,
          verified_via: "mpesa_onboarding",
        },
      })),
    })

    const claim = createMpesaAccountClaimStep(
      transform({ prepared }, ({ prepared }) => ({
        account_type: prepared.account_type,
        account_number: prepared.account_number,
        registered_name: prepared.registered_name,
        store_name: prepared.store_name,
        owner_msisdn: prepared.msisdn,
        session_id: prepared.session_id,
        verified_at: prepared.verified_at,
      }))
    )

    createRemoteLinkStep(
      transform({ provisioned, claim }, ({ provisioned, claim }) => [
        {
          [MERCHANT_MODULE]: { merchant_id: provisioned.merchant.id },
          [MPESA_ONBOARDING_MODULE]: { mpesa_account_claim_id: claim.id },
        },
      ])
    )

    createMerchantProductsWorkflow.runAsStep({
      input: transform({ prepared, provisioned }, ({ prepared, provisioned }) => ({
        merchant_id: provisioned.merchant.id,
        sales_channel_id: provisioned.salesChannel.id,
        products: prepared.products.map((product, index) => {
          const title = product.title
          // Handles are unique across the whole platform, so scope them to
          // the store and keep repeated titles apart.
          const base = `${prepared.slug}-${slugify(title) || "product"}`
          const isRepeat = prepared.products
            .slice(0, index)
            .some((previous) => slugify(previous.title) === slugify(title))

          return {
            title,
            handle: isRepeat ? `${base}-${index + 1}` : base,
            status: "published" as const,
            options: [{ title: "Default", values: ["Default"] }],
            variants: [
              {
                title: "Default",
                manage_inventory: false,
                options: { Default: "Default" },
                prices: [{ amount: product.price, currency_code: "kes" }],
              },
            ],
          }
        }),
      })),
    })

    completeMpesaOnboardingSessionStep(
      transform({ prepared, provisioned }, ({ prepared, provisioned }) => ({
        session_id: prepared.session_id,
        msisdn: prepared.msisdn,
        merchant_id: provisioned.merchant.id,
      }))
    )

    return new WorkflowResponse(
      transform({ prepared, provisioned }, ({ prepared, provisioned }) => ({
        merchant_id: provisioned.merchant.id,
        hostname: prepared.hostname,
        login_email: prepared.login_email,
        created_owner_login: !prepared.existing_owner_id,
      }))
    )
  }
)
