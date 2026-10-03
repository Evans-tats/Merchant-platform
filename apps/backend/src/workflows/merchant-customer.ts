import type { MedusaContainer } from "@medusajs/framework"
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils"
import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  when,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import {
  createCustomersWorkflow,
  linkCustomerGroupsToCustomerWorkflow,
} from "@medusajs/medusa/core-flows"

import { MERCHANT_MODULE } from "../modules/merchant"
import MerchantModuleService from "../modules/merchant/service"
import type { ResolvedMerchantId } from "../services/tenant-resolution"
import {
  listCustomerSegmentMemberships,
  validateMerchantSegmentIdsStep,
} from "./steps/merchant-customer-segments"
import {
  type MerchantScopeInput,
  validateMerchantScopeStep,
} from "./steps/validate-merchant-commerce"

type MerchantCustomerScope = {
  merchant_id: ResolvedMerchantId
  customer_id: string
}

export type MerchantCustomerCreateInput = {
  email: string
  first_name?: string | null
  last_name?: string | null
  company_name?: string | null
  phone?: string | null
}

export type CreateMerchantCustomerInput = MerchantScopeInput & {
  actor_id?: string
  customer: MerchantCustomerCreateInput
  segment_ids?: string[]
}

export type MerchantCustomerProfileUpdate = {
  first_name?: string | null
  last_name?: string | null
  company_name?: string | null
  phone?: string | null
  metadata?: Record<string, unknown> | null
  preferences?: Record<string, unknown>
}

export type MerchantCustomerAddressInput = {
  address_name?: string | null
  is_default_shipping?: boolean
  is_default_billing?: boolean
  company?: string | null
  first_name?: string | null
  last_name?: string | null
  address_1?: string | null
  address_2?: string | null
  city?: string | null
  country_code?: string | null
  province?: string | null
  postal_code?: string | null
  phone?: string | null
  metadata?: Record<string, unknown> | null
}

type CustomerGraph = {
  id: string
  email?: string | null
  first_name?: string | null
  last_name?: string | null
  company_name?: string | null
  phone?: string | null
  metadata?: Record<string, unknown> | null
  has_account?: boolean
  created_at?: Date | string
  updated_at?: Date | string
}

type ProfileGraph = {
  id: string
  merchant_id: string
  customer_id: string
  status: string
  profile?: Record<string, unknown>
  preferences?: Record<string, unknown>
  addresses?: Array<Record<string, unknown>>
  created_at?: Date | string
  updated_at?: Date | string
}

type MerchantOrdersGraph = {
  orders?: Array<Record<string, unknown> & { customer_id?: string | null }>
}

type AddressGraph = Record<string, unknown> & {
  id: string
  merchant_customer_profile?: {
    id: string
    merchant_id: string
    customer_id: string
  } | null
}

type EnsureProfileCompensation = {
  created_profile_id?: string
}

async function retrieveProfile(
  container: MedusaContainer,
  input: MerchantCustomerScope
): Promise<ProfileGraph | undefined> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "merchant_customer_profile",
    fields: [
      "id",
      "merchant_id",
      "customer_id",
      "status",
      "profile",
      "preferences",
      "addresses.*",
      "created_at",
      "updated_at",
    ],
    filters: {
      merchant_id: input.merchant_id,
      customer_id: input.customer_id,
    },
  })

  return (data as unknown as ProfileGraph[])[0]
}

const ensureMerchantCustomerProfileStep = createStep(
  "ensure-merchant-customer-profile",
  async (input: MerchantCustomerScope, { container }) => {
    const existing = await retrieveProfile(container, input)

    if (existing) {
      if (existing.status !== "active") {
        throw new MedusaError(
          MedusaError.Types.FORBIDDEN,
          "Merchant customer profile is suspended"
        )
      }

      return new StepResponse<
        ProfileGraph,
        EnsureProfileCompensation
      >(
        existing,
        {}
      )
    }

    const customerService = container.resolve(Modules.CUSTOMER)
    await customerService.retrieveCustomer(input.customer_id)

    const merchantService =
      container.resolve<MerchantModuleService>(MERCHANT_MODULE)
    const profile =
      await merchantService.createMerchantCustomerProfiles({
        merchant_id: input.merchant_id,
        customer_id: input.customer_id,
        status: "active",
        profile: {},
        preferences: {},
      })

    return new StepResponse<
      ProfileGraph,
      EnsureProfileCompensation
    >(
      profile as unknown as ProfileGraph,
      { created_profile_id: profile.id }
    )
  },
  async (compensation, { container }) => {
    if (!compensation?.created_profile_id) {
      return
    }

    const merchantService =
      container.resolve<MerchantModuleService>(MERCHANT_MODULE)
    await merchantService.deleteMerchantCustomerProfiles(
      compensation.created_profile_id
    )
  }
)

const retrieveMerchantCustomerStep = createStep(
  "retrieve-merchant-customer",
  async (input: MerchantCustomerScope, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const [{ data: customerData }, profile, { data: merchantData }, segments] =
      await Promise.all([
        query.graph({
          entity: "customer",
          fields: [
            "id",
            "email",
            "first_name",
            "last_name",
            "company_name",
            "phone",
            "metadata",
            "has_account",
            "created_at",
            "updated_at",
          ],
          filters: { id: input.customer_id },
        }),
        retrieveProfile(container, input),
        query.graph({
          entity: "merchant",
          fields: [
            "orders.id",
            "orders.customer_id",
            "orders.display_id",
            "orders.status",
            "orders.currency_code",
            "orders.total",
            "orders.created_at",
            "orders.updated_at",
            "orders.items.*",
          ],
          filters: { id: input.merchant_id },
        }),
        listCustomerSegmentMemberships(
          container,
          input.merchant_id,
          input.customer_id
        ),
      ])
    const customer = (customerData as unknown as CustomerGraph[])[0]
    const merchant = (merchantData as unknown as MerchantOrdersGraph[])[0]

    const orders = (merchant?.orders ?? []).filter(
      ({ customer_id }) => customer_id === input.customer_id
    )

    if (!customer || (!profile && !orders.length)) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        "Merchant customer not found"
      )
    }

    const profileFields = profile?.profile ?? {}

    return new StepResponse({
      ...customer,
      ...profileFields,
      id: customer.id,
      email: customer.email,
      addresses: profile?.addresses ?? [],
      orders,
      segments,
      merchant_profile: profile
        ? {
            id: profile.id,
            status: profile.status,
            preferences: profile.preferences ?? {},
            created_at: profile.created_at,
            updated_at: profile.updated_at,
          }
        : null,
    })
  }
)

const updateMerchantCustomerProfileStep = createStep(
  "update-merchant-customer-profile",
  async (
    input: MerchantCustomerScope & {
      update: MerchantCustomerProfileUpdate
    },
    { container }
  ) => {
    const current = await retrieveProfile(container, input)

    if (!current || current.status !== "active") {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        "Merchant customer profile not found"
      )
    }

    const { preferences, ...profileUpdate } = input.update
    const merchantService =
      container.resolve<MerchantModuleService>(MERCHANT_MODULE)
    const updated = await merchantService.updateMerchantCustomerProfiles({
      id: current.id,
      profile: {
        ...(current.profile ?? {}),
        ...profileUpdate,
      },
      preferences: preferences
        ? {
            ...(current.preferences ?? {}),
            ...preferences,
          }
        : current.preferences ?? {},
    })

    return new StepResponse(updated, {
      id: current.id,
      profile: current.profile ?? {},
      preferences: current.preferences ?? {},
    })
  },
  async (previous, { container }) => {
    if (!previous) {
      return
    }

    const merchantService =
      container.resolve<MerchantModuleService>(MERCHANT_MODULE)
    await merchantService.updateMerchantCustomerProfiles(previous)
  }
)

async function requireOwnedAddress(
  container: MedusaContainer,
  input: MerchantCustomerScope & { address_id: string }
): Promise<AddressGraph> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "merchant_customer_address",
    fields: [
      "*",
      "merchant_customer_profile.id",
      "merchant_customer_profile.merchant_id",
      "merchant_customer_profile.customer_id",
    ],
    filters: { id: input.address_id },
  })
  const address = (data as unknown as AddressGraph[])[0]
  const profile = address?.merchant_customer_profile

  if (
    !address ||
    profile?.merchant_id !== input.merchant_id ||
    profile.customer_id !== input.customer_id
  ) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "Merchant customer address not found"
    )
  }

  return address
}

async function clearOtherDefaults(
  merchantService: MerchantModuleService,
  profile: ProfileGraph,
  address: MerchantCustomerAddressInput,
  excludedAddressId?: string
) {
  const updates: Array<Record<string, unknown> & { id: string }> = []

  for (const existing of profile.addresses ?? []) {
    if (existing.id === excludedAddressId) {
      continue
    }

    const update: Record<string, unknown> & { id: string } = {
      id: existing.id as string,
    }

    if (
      address.is_default_shipping &&
      existing.is_default_shipping === true
    ) {
      update.is_default_shipping = false
    }

    if (
      address.is_default_billing &&
      existing.is_default_billing === true
    ) {
      update.is_default_billing = false
    }

    if (Object.keys(update).length > 1) {
      updates.push(update)
    }
  }

  if (updates.length) {
    await merchantService.updateMerchantCustomerAddresses(updates)
  }
}

const createMerchantCustomerAddressStep = createStep(
  "create-merchant-customer-address",
  async (
    input: MerchantCustomerScope & {
      address: MerchantCustomerAddressInput
    },
    { container }
  ) => {
    const profile = await retrieveProfile(container, input)

    if (!profile || profile.status !== "active") {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        "Merchant customer profile not found"
      )
    }

    const merchantService =
      container.resolve<MerchantModuleService>(MERCHANT_MODULE)
    await clearOtherDefaults(merchantService, profile, input.address)
    const created =
      await merchantService.createMerchantCustomerAddresses({
        merchant_customer_profile_id: profile.id,
        ...input.address,
      })

    return new StepResponse(created, created.id)
  },
  async (addressId, { container }) => {
    if (!addressId) {
      return
    }

    const merchantService =
      container.resolve<MerchantModuleService>(MERCHANT_MODULE)
    await merchantService.deleteMerchantCustomerAddresses(addressId)
  }
)

const updateMerchantCustomerAddressStep = createStep(
  "update-merchant-customer-address",
  async (
    input: MerchantCustomerScope & {
      address_id: string
      address: MerchantCustomerAddressInput
    },
    { container }
  ) => {
    const existing = await requireOwnedAddress(container, input)
    const profile = await retrieveProfile(container, input)

    if (!profile) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        "Merchant customer profile not found"
      )
    }

    const merchantService =
      container.resolve<MerchantModuleService>(MERCHANT_MODULE)
    await clearOtherDefaults(
      merchantService,
      profile,
      input.address,
      existing.id
    )
    const updated =
      await merchantService.updateMerchantCustomerAddresses({
        id: existing.id,
        ...input.address,
      })

    return new StepResponse(updated)
  }
)

const deleteMerchantCustomerAddressStep = createStep(
  "delete-merchant-customer-address",
  async (
    input: MerchantCustomerScope & { address_id: string },
    { container }
  ) => {
    const existing = await requireOwnedAddress(container, input)
    const merchantService =
      container.resolve<MerchantModuleService>(MERCHANT_MODULE)
    await merchantService.deleteMerchantCustomerAddresses(existing.id)

    return new StepResponse(existing.id)
  }
)

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function profileFields(customer: MerchantCustomerCreateInput) {
  const fields: Record<string, string> = {}

  for (const key of [
    "first_name",
    "last_name",
    "company_name",
    "phone",
  ] as const) {
    const value = customer[key]?.trim()

    if (value) {
      fields[key] = value
    }
  }

  return fields
}

/**
 * Core customers are shared across merchants. A merchant-created customer
 * reuses an existing guest record for the same email instead of duplicating
 * it, and never attaches to a registered account on the shopper's behalf.
 */
const findReusableCustomerStep = createStep(
  "find-reusable-merchant-customer",
  async (
    input: { merchant_id: ResolvedMerchantId; email: string },
    { container }
  ) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "customer",
      fields: ["id"],
      filters: { email: normalizeEmail(input.email), has_account: false },
    })
    const existing = (data as unknown as Array<{ id: string }>)[0]

    if (existing) {
      const profile = await retrieveProfile(container, {
        merchant_id: input.merchant_id,
        customer_id: existing.id,
      })

      if (profile) {
        throw new MedusaError(
          MedusaError.Types.DUPLICATE_ERROR,
          "A customer with this email already exists"
        )
      }
    }

    return new StepResponse(existing ? { id: existing.id } : null)
  }
)

const createMerchantCustomerProfileStep = createStep(
  "create-merchant-customer-profile",
  async (
    input: MerchantCustomerScope & { customer: MerchantCustomerCreateInput },
    { container }
  ) => {
    const merchantService =
      container.resolve<MerchantModuleService>(MERCHANT_MODULE)
    const profile = await merchantService.createMerchantCustomerProfiles({
      merchant_id: input.merchant_id,
      customer_id: input.customer_id,
      status: "active",
      profile: profileFields(input.customer),
      preferences: {},
    })

    return new StepResponse(profile, profile.id)
  },
  async (profileId, { container }) => {
    if (!profileId) {
      return
    }

    const merchantService =
      container.resolve<MerchantModuleService>(MERCHANT_MODULE)
    await merchantService.deleteMerchantCustomerProfiles(profileId)
  }
)

export const createMerchantCustomerWorkflow = createWorkflow(
  "create-merchant-customer",
  function (input: CreateMerchantCustomerInput) {
    const scope = validateMerchantScopeStep(input)
    const segmentIds = validateMerchantSegmentIdsStep({
      merchant_id: scope.merchant_id,
      segment_ids: input.segment_ids,
    })
    const existing = findReusableCustomerStep({
      merchant_id: scope.merchant_id,
      email: input.customer.email,
    })
    const created = when(
      "create-core-customer-when-missing",
      { existing },
      ({ existing }) => !existing
    ).then(() => {
      const customersInput = transform({ input }, ({ input }) => ({
        customersData: [
          {
            ...profileFields(input.customer),
            email: normalizeEmail(input.customer.email),
            has_account: false,
            created_by: input.actor_id ?? null,
          },
        ],
      }))

      return createCustomersWorkflow.runAsStep({ input: customersInput })
    })
    const customerScope = transform(
      { existing, created, scope },
      ({ existing, created, scope }) => ({
        merchant_id: scope.merchant_id,
        customer_id: existing?.id ?? created![0].id,
      })
    )
    const profileInput = transform(
      { customerScope, input },
      ({ customerScope, input }) => ({
        ...customerScope,
        customer: input.customer,
      })
    )

    createMerchantCustomerProfileStep(profileInput)

    const segmentLinks = transform(
      { customerScope, segmentIds },
      ({ customerScope, segmentIds }) => ({
        id: customerScope.customer_id,
        add: segmentIds,
      })
    )

    linkCustomerGroupsToCustomerWorkflow.runAsStep({ input: segmentLinks })

    const customer = retrieveMerchantCustomerStep(customerScope)

    return new WorkflowResponse(customer)
  }
)

export const retrieveMerchantCustomerWorkflow = createWorkflow(
  "retrieve-merchant-customer",
  function (input: MerchantCustomerScope) {
    const customer = retrieveMerchantCustomerStep(input)

    return new WorkflowResponse(customer)
  }
)

export const updateMerchantCustomerWorkflow = createWorkflow(
  "update-merchant-customer",
  function (
    input: MerchantCustomerScope & {
      update: MerchantCustomerProfileUpdate
    }
  ) {
    ensureMerchantCustomerProfileStep(input)
    updateMerchantCustomerProfileStep(input)
    const customer = retrieveMerchantCustomerStep(input)

    return new WorkflowResponse(customer)
  }
)

export const createMerchantCustomerAddressWorkflow = createWorkflow(
  "create-merchant-customer-address",
  function (
    input: MerchantCustomerScope & {
      address: MerchantCustomerAddressInput
    }
  ) {
    ensureMerchantCustomerProfileStep(input)
    createMerchantCustomerAddressStep(input)
    const customer = retrieveMerchantCustomerStep(input)

    return new WorkflowResponse(customer)
  }
)

export const updateMerchantCustomerAddressWorkflow = createWorkflow(
  "update-merchant-customer-address",
  function (
    input: MerchantCustomerScope & {
      address_id: string
      address: MerchantCustomerAddressInput
    }
  ) {
    updateMerchantCustomerAddressStep(input)
    const customer = retrieveMerchantCustomerStep(input)

    return new WorkflowResponse(customer)
  }
)

export const deleteMerchantCustomerAddressWorkflow = createWorkflow(
  "delete-merchant-customer-address",
  function (
    input: MerchantCustomerScope & {
      address_id: string
    }
  ) {
    const deletedId = deleteMerchantCustomerAddressStep(input)
    const customer = retrieveMerchantCustomerStep(input)

    return new WorkflowResponse({ deleted_id: deletedId, customer })
  }
)
