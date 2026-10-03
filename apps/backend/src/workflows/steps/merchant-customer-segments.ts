import type { MedusaContainer } from "@medusajs/framework"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import {
  createStep,
  StepResponse,
} from "@medusajs/framework/workflows-sdk"

import {
  filterSegments,
  segmentGroupName,
  toMerchantCustomerSegment,
  type MerchantCustomerSegment,
  type MerchantSegmentGroupSource,
} from "../../services/merchant-customer-segments"
import {
  assertMerchantOwns,
  type ResolvedMerchantId,
} from "../../services/tenant-resolution"

type SegmentGroupGraph = Omit<MerchantSegmentGroupSource, "customers"> & {
  merchant?: { id: string } | null
  customers?: Array<{
    id: string
    email?: string | null
    first_name?: string | null
    last_name?: string | null
    company_name?: string | null
    phone?: string | null
    has_account?: boolean
  }> | null
}

type MerchantSegmentsGraph = {
  customer_groups?: SegmentGroupGraph[] | null
}

type CustomerGroupsGraph = {
  id: string
  groups?: MerchantSegmentGroupSource[] | null
}

type ProfileOverridesGraph = {
  customer_id: string
  profile?: Record<string, unknown> | null
}

export type MerchantCustomerSegmentSummary = Pick<
  MerchantCustomerSegment,
  "id" | "name" | "description"
>

export type MerchantCustomerSegmentMember = {
  id: string
  email: string | null
  first_name: string | null
  last_name: string | null
  company_name: string | null
  phone: string | null
  has_account: boolean
}

export type MerchantCustomerSegmentDetail = MerchantCustomerSegment & {
  metadata: Record<string, unknown>
  customers: MerchantCustomerSegmentMember[]
}

function segmentNotFound() {
  return new MedusaError(
    MedusaError.Types.NOT_FOUND,
    "Customer segment not found"
  )
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function uniqueIds(ids: readonly string[] | undefined): string[] {
  return Array.from(new Set((ids ?? []).filter(Boolean)))
}

function toSummary(
  group: MerchantSegmentGroupSource
): MerchantCustomerSegmentSummary {
  const { id, name, description } = toMerchantCustomerSegment(group)

  return { id, name, description }
}

async function listMerchantSegmentGroupIds(
  container: MedusaContainer,
  merchantId: ResolvedMerchantId
): Promise<Set<string>> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "merchant",
    fields: ["customer_groups.id"],
    filters: { id: merchantId },
  })
  const merchant = (data as unknown as MerchantSegmentsGraph[])[0]

  return new Set((merchant?.customer_groups ?? []).map(({ id }) => id))
}

/**
 * Customers belong to a merchant when the merchant has a customer profile for
 * them or has received an order from them.
 */
async function listMerchantCustomerIds(
  container: MedusaContainer,
  merchantId: ResolvedMerchantId,
  customerIds: string[]
): Promise<Set<string>> {
  if (!customerIds.length) {
    return new Set()
  }

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: profiles } = await query.graph({
    entity: "merchant_customer_profile",
    fields: ["customer_id"],
    filters: { merchant_id: merchantId, customer_id: customerIds },
  })
  const owned = new Set(
    (profiles as unknown as Array<{ customer_id: string }>).map(
      ({ customer_id }) => customer_id
    )
  )
  const remaining = customerIds.filter((id) => !owned.has(id))

  if (remaining.length) {
    const { data: orders } = await query.graph({
      entity: "order",
      fields: ["id", "customer_id", "merchant.id"],
      filters: { customer_id: remaining },
    })

    for (const order of orders as unknown as Array<{
      customer_id?: string | null
      merchant?: { id: string } | null
    }>) {
      if (order.customer_id && order.merchant?.id === merchantId) {
        owned.add(order.customer_id)
      }
    }
  }

  return owned
}

export async function listCustomerSegmentMemberships(
  container: MedusaContainer,
  merchantId: ResolvedMerchantId,
  customerId: string
): Promise<MerchantCustomerSegmentSummary[]> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const [{ data }, merchantGroupIds] = await Promise.all([
    query.graph({
      entity: "customer",
      fields: ["id", "groups.id", "groups.name", "groups.metadata"],
      filters: { id: customerId },
    }),
    listMerchantSegmentGroupIds(container, merchantId),
  ])
  const customer = (data as unknown as CustomerGroupsGraph[])[0]

  return (customer?.groups ?? [])
    .filter(({ id }) => merchantGroupIds.has(id))
    .map(toSummary)
    .sort((left, right) =>
      left.name.localeCompare(right.name, undefined, { sensitivity: "base" })
    )
}

export async function listMerchantSegmentCustomerIds(
  container: MedusaContainer,
  merchantId: ResolvedMerchantId,
  segmentId: string
): Promise<Set<string>> {
  await assertMerchantOwns(container, "customer_group", segmentId, merchantId)

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "customer_group",
    fields: ["id", "customers.id"],
    filters: { id: segmentId },
  })
  const group = (data as unknown as SegmentGroupGraph[])[0]

  return new Set((group?.customers ?? []).map(({ id }) => id))
}

export const listMerchantCustomerSegmentsStep = createStep(
  "list-merchant-customer-segments",
  async (
    input: {
      merchant_id: ResolvedMerchantId
      q?: string
      limit: number
      offset: number
    },
    { container }
  ) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "merchant",
      fields: [
        "customer_groups.id",
        "customer_groups.name",
        "customer_groups.metadata",
        "customer_groups.created_at",
        "customer_groups.updated_at",
        "customer_groups.customers.id",
      ],
      filters: { id: input.merchant_id },
    })
    const merchant = (data as unknown as MerchantSegmentsGraph[])[0]
    const segments = filterSegments(
      (merchant?.customer_groups ?? []).map(toMerchantCustomerSegment),
      input.q
    )

    return new StepResponse({
      customer_segments: segments.slice(
        input.offset,
        input.offset + input.limit
      ),
      count: segments.length,
      limit: input.limit,
      offset: input.offset,
    })
  }
)

export const retrieveMerchantCustomerSegmentStep = createStep(
  "retrieve-merchant-customer-segment",
  async (
    input: { merchant_id: ResolvedMerchantId; segment_id: string },
    { container }
  ) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "customer_group",
      fields: [
        "id",
        "name",
        "metadata",
        "created_at",
        "updated_at",
        "merchant.id",
        "customers.id",
        "customers.email",
        "customers.first_name",
        "customers.last_name",
        "customers.company_name",
        "customers.phone",
        "customers.has_account",
      ],
      filters: { id: input.segment_id },
    })
    const group = (data as unknown as SegmentGroupGraph[])[0]

    if (!group || group.merchant?.id !== input.merchant_id) {
      throw segmentNotFound()
    }

    const members = group.customers ?? []
    const { data: profileData } = members.length
      ? await query.graph({
          entity: "merchant_customer_profile",
          fields: ["customer_id", "profile"],
          filters: {
            merchant_id: input.merchant_id,
            customer_id: members.map(({ id }) => id),
          },
        })
      : { data: [] }
    const overrides = new Map(
      (profileData as unknown as ProfileOverridesGraph[]).map((profile) => [
        profile.customer_id,
        profile.profile ?? {},
      ])
    )
    const customers = members
      .map((customer): MerchantCustomerSegmentMember => {
        const profile = overrides.get(customer.id) ?? {}

        return {
          id: customer.id,
          email: stringValue(customer.email) ?? stringValue(profile.email),
          first_name:
            stringValue(profile.first_name) ?? stringValue(customer.first_name),
          last_name:
            stringValue(profile.last_name) ?? stringValue(customer.last_name),
          company_name:
            stringValue(profile.company_name) ??
            stringValue(customer.company_name),
          phone: stringValue(profile.phone) ?? stringValue(customer.phone),
          has_account: customer.has_account === true,
        }
      })
      .sort((left, right) =>
        (left.email ?? left.id).localeCompare(right.email ?? right.id)
      )

    const detail: MerchantCustomerSegmentDetail = {
      ...toMerchantCustomerSegment(group),
      metadata: group.metadata ?? {},
      customers,
    }

    return new StepResponse(detail)
  }
)

export const validateMerchantSegmentNameStep = createStep(
  "validate-merchant-segment-name",
  async (
    input: {
      merchant_id: ResolvedMerchantId
      name?: string
      exclude_segment_id?: string
    },
    { container }
  ) => {
    if (input.name === undefined) {
      return new StepResponse(undefined)
    }

    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "customer_group",
      fields: ["id"],
      filters: { name: segmentGroupName(input.merchant_id, input.name) },
    })
    const conflict = (data as unknown as Array<{ id: string }>).find(
      ({ id }) => id !== input.exclude_segment_id
    )

    if (conflict) {
      throw new MedusaError(
        MedusaError.Types.DUPLICATE_ERROR,
        `A customer segment named "${input.name.trim()}" already exists`
      )
    }

    return new StepResponse(undefined)
  }
)

export const validateMerchantSegmentIdsStep = createStep(
  "validate-merchant-segment-ids",
  async (
    input: { merchant_id: ResolvedMerchantId; segment_ids?: string[] },
    { container }
  ) => {
    const segmentIds = uniqueIds(input.segment_ids)

    if (!segmentIds.length) {
      return new StepResponse(segmentIds)
    }

    const owned = await listMerchantSegmentGroupIds(
      container,
      input.merchant_id
    )

    if (segmentIds.some((id) => !owned.has(id))) {
      throw segmentNotFound()
    }

    return new StepResponse(segmentIds)
  }
)

export const validateMerchantCustomersStep = createStep(
  "validate-merchant-customers",
  async (
    input: { merchant_id: ResolvedMerchantId; customer_ids?: string[] },
    { container }
  ) => {
    const customerIds = uniqueIds(input.customer_ids)
    const owned = await listMerchantCustomerIds(
      container,
      input.merchant_id,
      customerIds
    )

    if (customerIds.some((id) => !owned.has(id))) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        "Merchant customer not found"
      )
    }

    return new StepResponse(customerIds)
  }
)

export const listCustomerSegmentMembershipsStep = createStep(
  "list-customer-segment-memberships",
  async (
    input: { merchant_id: ResolvedMerchantId; customer_id: string },
    { container }
  ) => {
    const segments = await listCustomerSegmentMemberships(
      container,
      input.merchant_id,
      input.customer_id
    )

    return new StepResponse(segments)
  }
)
