import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { getOrdersListWorkflow } from "@medusajs/medusa/core-flows"

import type { ResolvedMerchantId } from "../services/tenant-resolution"
import {
  buildMerchantCustomerList,
  type MerchantCustomerOrderSource,
  type MerchantCustomerProfileSource,
} from "../services/merchant-customer-list"
import { listMerchantSegmentCustomerIds } from "./steps/merchant-customer-segments"
import {
  type MerchantScopeInput,
  validateMerchantScopeStep,
} from "./steps/validate-merchant-commerce"

type MerchantManagementOrderLink = {
  id: string
}

type MerchantManagementGraph = Record<string, unknown> & {
  orders?: MerchantManagementOrderLink[]
  customer_profiles?: MerchantCustomerProfileSource[]
}

type MerchantCustomerListGraph = {
  orders?: MerchantCustomerOrderSource[]
  customer_profiles?: MerchantCustomerProfileSource[]
}

export type ListMerchantCustomersInput = MerchantScopeInput & {
  q?: string
  account_type?: "registered" | "guest"
  segment_id?: string
  limit: number
  offset: number
}

type MerchantSessionMemberGraph = {
  id: string
  actor_id: string
  role: "owner" | "admin" | "staff"
  status: string
  user?: { id: string } | null
  merchant?: {
    id: string
    name: string
    slug: string
    status: string
    primary_sales_channel?: {
      id: string
      name: string
    } | null
  } | null
}

type RetrieveMerchantSessionInput = {
  actor_id: string
  merchant_id?: string
}

const retrieveMerchantSessionRecordStep = createStep(
  "retrieve-merchant-session-record",
  async (input: RetrieveMerchantSessionInput, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "merchant_member",
      fields: [
        "id",
        "actor_id",
        "role",
        "status",
        "user.id",
        "merchant.id",
        "merchant.name",
        "merchant.slug",
        "merchant.status",
        "merchant.primary_sales_channel.id",
        "merchant.primary_sales_channel.name",
      ],
      filters: {
        actor_id: input.actor_id,
        status: "active",
      },
    })
    const memberships = (data as unknown as MerchantSessionMemberGraph[])
      .filter(
        (membership) =>
          membership.actor_id === input.actor_id &&
          membership.user?.id === input.actor_id &&
          membership.status === "active" &&
          membership.merchant?.status === "active" &&
          Boolean(membership.merchant.primary_sales_channel)
      )
      .sort((left, right) =>
        left.merchant!.id.localeCompare(right.merchant!.id)
      )

    if (!memberships.length) {
      throw new MedusaError(
        MedusaError.Types.FORBIDDEN,
        "Active merchant membership required"
      )
    }

    const selected = input.merchant_id
      ? memberships.find(
          (membership) => membership.merchant?.id === input.merchant_id
        )
      : memberships[0]

    if (!selected) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        "Merchant membership not found"
      )
    }

    return new StepResponse({
      merchant: selected.merchant!,
      member: {
        id: selected.id,
        actor_id: selected.actor_id,
        role: selected.role,
        status: "active" as const,
      },
      memberships: memberships.map((membership) => ({
        merchant: membership.merchant!,
        member: {
          id: membership.id,
          actor_id: membership.actor_id,
          role: membership.role,
          status: "active" as const,
        },
      })),
    })
  }
)

const retrieveMerchantManagementStep = createStep(
  "retrieve-merchant-management",
  async (
    input: { merchant_id: ResolvedMerchantId },
    { container }
  ) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "merchant",
      fields: [
        "id",
        "name",
        "slug",
        "status",
        "created_at",
        "updated_at",
        "primary_sales_channel.id",
        "primary_sales_channel.name",
        "domains.id",
        "domains.hostname",
        "domains.type",
        "domains.status",
        "domains.is_primary",
        "members.id",
        "members.actor_id",
        "members.role",
        "members.status",
        "members.user.id",
        "members.user.email",
        "members.user.first_name",
        "members.user.last_name",
        "invitations.id",
        "invitations.email",
        "invitations.role",
        "invitations.status",
        "invitations.created_at",
        "themes.id",
        "themes.version",
        "themes.configuration",
        "themes.is_active",
        "payment_configs.id",
        "payment_configs.provider",
        "payment_configs.mode",
        "payment_configs.status",
        "payment_configs.public_configuration",
        "product_categories.id",
        "product_categories.name",
        "product_categories.handle",
        "product_categories.description",
        "product_categories.is_active",
        "product_categories.is_internal",
        "product_categories.parent_category_id",
        "product_collections.id",
        "product_collections.title",
        "product_collections.handle",
        "product_collections.created_at",
        "product_collections.updated_at",
        "orders.id",
        "products.id",
        "products.title",
        "products.handle",
        "products.status",
        "products.thumbnail",
        "products.created_at",
        "stock_locations.id",
        "stock_locations.name",
        "stock_locations.address.*",
        "shipping_profiles.id",
        "shipping_profiles.name",
        "shipping_profiles.type",
        "customer_profiles.id",
        "customer_profiles.customer_id",
        "customer_profiles.status",
        "customer_profiles.profile",
        "customer_profiles.created_at",
        "customer_profiles.customer.id",
        "customer_profiles.customer.email",
        "customer_profiles.customer.first_name",
        "customer_profiles.customer.last_name",
        "customer_profiles.customer.company_name",
        "customer_profiles.customer.phone",
        "customer_profiles.customer.has_account",
        "customer_profiles.customer.created_at",
      ],
      filters: { id: input.merchant_id },
    })

    return new StepResponse(
      (data as unknown as MerchantManagementGraph[])[0]
    )
  }
)

const listMerchantCustomersStep = createStep(
  "list-merchant-customers",
  async (
    input: {
      merchant_id: ResolvedMerchantId
      q?: string
      account_type?: "registered" | "guest"
      segment_id?: string
      limit: number
      offset: number
    },
    { container }
  ) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const segmentCustomerIds = input.segment_id
      ? await listMerchantSegmentCustomerIds(
          container,
          input.merchant_id,
          input.segment_id
        )
      : undefined
    const { data } = await query.graph({
      entity: "merchant",
      fields: [
        "orders.id",
        "orders.customer_id",
        "orders.email",
        "orders.created_at",
        "orders.customer.id",
        "orders.customer.email",
        "orders.customer.first_name",
        "orders.customer.last_name",
        "orders.customer.company_name",
        "orders.customer.phone",
        "orders.customer.has_account",
        "orders.customer.created_at",
        "customer_profiles.id",
        "customer_profiles.customer_id",
        "customer_profiles.status",
        "customer_profiles.profile",
        "customer_profiles.created_at",
        "customer_profiles.customer.id",
        "customer_profiles.customer.email",
        "customer_profiles.customer.first_name",
        "customer_profiles.customer.last_name",
        "customer_profiles.customer.company_name",
        "customer_profiles.customer.phone",
        "customer_profiles.customer.has_account",
        "customer_profiles.customer.created_at",
      ],
      filters: { id: input.merchant_id },
    })
    const merchant = (data as unknown as MerchantCustomerListGraph[])[0]
    const search = input.q?.trim().toLowerCase()
    const customers = buildMerchantCustomerList({
      orders: merchant?.orders ?? [],
      customerProfiles: merchant?.customer_profiles ?? [],
    }).filter((customer) => {
      const matchesAccount =
        !input.account_type ||
        (input.account_type === "registered" && customer.has_account) ||
        (input.account_type === "guest" && !customer.has_account)
      const matchesSearch =
        !search ||
        [
          customer.customer_id,
          customer.email,
          customer.first_name,
          customer.last_name,
          customer.company_name,
          customer.phone,
          customer.status,
          customer.has_account ? "registered" : "guest",
        ]
          .join(" ")
          .toLowerCase()
          .includes(search)

      const matchesSegment =
        !segmentCustomerIds ||
        (customer.customer_id !== null &&
          segmentCustomerIds.has(customer.customer_id))

      return matchesAccount && matchesSearch && matchesSegment
    })

    return new StepResponse({
      customers: customers.slice(input.offset, input.offset + input.limit),
      count: customers.length,
      limit: input.limit,
      offset: input.offset,
    })
  }
)

export const retrieveMerchantManagementWorkflow = createWorkflow(
  "retrieve-merchant-management",
  function (input: MerchantScopeInput) {
    const scope = validateMerchantScopeStep(input)
    const merchant = retrieveMerchantManagementStep({
      merchant_id: scope.merchant_id,
    })
    const orderIds = transform({ merchant }, ({ merchant }) =>
      (merchant?.orders ?? []).map((order) => order.id)
    )
    const orders = getOrdersListWorkflow.runAsStep({
      input: {
        fields: [
          "id",
          "display_id",
          "status",
          "fulfillment_status",
          "payment_status",
          "email",
          "customer_id",
          "currency_code",
          "total",
          "created_at",
          "customer.id",
          "customer.email",
          "customer.first_name",
          "customer.last_name",
          "customer.company_name",
          "customer.phone",
          "customer.has_account",
          "customer.created_at",
          "fulfillments.id",
          "fulfillments.status",
          "fulfillments.canceled_at",
          "fulfillments.shipped_at",
          "fulfillments.delivered_at",
        ],
        variables: { id: orderIds },
      },
    })
    const result = transform({ merchant, orders }, ({ merchant, orders }) => {
      const orderRows = (
        Array.isArray(orders) ? orders : orders.rows
      ) as MerchantCustomerOrderSource[]

      return {
        ...merchant,
        orders: orderRows,
        customers: buildMerchantCustomerList({
          orders: orderRows,
          customerProfiles: merchant?.customer_profiles ?? [],
        }),
      }
    })

    return new WorkflowResponse(result)
  }
)

export const listMerchantCustomersWorkflow = createWorkflow(
  "list-merchant-customers",
  function (input: ListMerchantCustomersInput) {
    const scope = validateMerchantScopeStep(input)
    const customers = listMerchantCustomersStep({
      merchant_id: scope.merchant_id,
      q: input.q,
      account_type: input.account_type,
      segment_id: input.segment_id,
      limit: input.limit,
      offset: input.offset,
    })

    return new WorkflowResponse(customers)
  }
)

export const retrieveMerchantSessionWorkflow = createWorkflow(
  "retrieve-merchant-session",
  function (input: RetrieveMerchantSessionInput) {
    const session = retrieveMerchantSessionRecordStep(input)

    return new WorkflowResponse(session)
  }
)
