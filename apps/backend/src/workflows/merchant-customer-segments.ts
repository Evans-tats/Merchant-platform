import { Modules } from "@medusajs/framework/utils"
import {
  createWorkflow,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import {
  createCustomerGroupsWorkflow,
  createRemoteLinkStep,
  deleteCustomerGroupsWorkflow,
  dismissRemoteLinkStep,
  linkCustomerGroupsToCustomerWorkflow,
  linkCustomersToCustomerGroupWorkflow,
  updateCustomerGroupsWorkflow,
} from "@medusajs/medusa/core-flows"

import { MERCHANT_MODULE } from "../modules/merchant"
import {
  segmentGroupMetadata,
  segmentGroupName,
  toMerchantCustomerSegment,
} from "../services/merchant-customer-segments"
import {
  listCustomerSegmentMembershipsStep,
  listMerchantCustomerSegmentsStep,
  retrieveMerchantCustomerSegmentStep,
  validateMerchantCustomersStep,
  validateMerchantSegmentIdsStep,
  validateMerchantSegmentNameStep,
} from "./steps/merchant-customer-segments"
import {
  type MerchantScopeInput,
  validateMerchantScopeStep,
} from "./steps/validate-merchant-commerce"

export type MerchantCustomerSegmentInput = {
  name: string
  description?: string | null
}

export type ListMerchantCustomerSegmentsInput = MerchantScopeInput & {
  q?: string
  limit: number
  offset: number
}

type MerchantCustomerSegmentScope = MerchantScopeInput & {
  segment_id: string
}

export type CreateMerchantCustomerSegmentInput = MerchantScopeInput & {
  actor_id?: string
  segment: MerchantCustomerSegmentInput
}

export type UpdateMerchantCustomerSegmentInput =
  MerchantCustomerSegmentScope & {
    update: Partial<MerchantCustomerSegmentInput>
  }

export type ManageMerchantCustomerSegmentCustomersInput =
  MerchantCustomerSegmentScope & {
    add?: string[]
    remove?: string[]
  }

export type ManageMerchantCustomerSegmentsInput = MerchantScopeInput & {
  customer_id: string
  add?: string[]
  remove?: string[]
}

export const listMerchantCustomerSegmentsWorkflow = createWorkflow(
  "list-merchant-customer-segments",
  function (input: ListMerchantCustomerSegmentsInput) {
    const scope = validateMerchantScopeStep(input)
    const segments = listMerchantCustomerSegmentsStep({
      merchant_id: scope.merchant_id,
      q: input.q,
      limit: input.limit,
      offset: input.offset,
    })

    return new WorkflowResponse(segments)
  }
)

export const retrieveMerchantCustomerSegmentWorkflow = createWorkflow(
  "retrieve-merchant-customer-segment",
  function (input: MerchantCustomerSegmentScope) {
    const scope = validateMerchantScopeStep(input)
    const segment = retrieveMerchantCustomerSegmentStep({
      merchant_id: scope.merchant_id,
      segment_id: input.segment_id,
    })

    return new WorkflowResponse(segment)
  }
)

export const createMerchantCustomerSegmentWorkflow = createWorkflow(
  "create-merchant-customer-segment",
  function (input: CreateMerchantCustomerSegmentInput) {
    const scope = validateMerchantScopeStep(input)

    validateMerchantSegmentNameStep({
      merchant_id: scope.merchant_id,
      name: input.segment.name,
    })
    const groupsInput = transform({ input, scope }, ({ input, scope }) => ({
      customersData: [
        {
          name: segmentGroupName(scope.merchant_id, input.segment.name),
          metadata: segmentGroupMetadata({
            merchant_id: scope.merchant_id,
            name: input.segment.name,
            description: input.segment.description,
          }),
          created_by: input.actor_id,
        },
      ],
    }))
    const groups = createCustomerGroupsWorkflow.runAsStep({
      input: groupsInput,
    })
    const links = transform({ groups, scope }, ({ groups, scope }) =>
      groups.map((group) => ({
        [MERCHANT_MODULE]: { merchant_id: scope.merchant_id },
        [Modules.CUSTOMER]: { customer_group_id: group.id },
      }))
    )

    createRemoteLinkStep(links)

    const segment = transform({ groups }, ({ groups }) =>
      toMerchantCustomerSegment(groups[0])
    )

    return new WorkflowResponse(segment)
  }
)

export const updateMerchantCustomerSegmentWorkflow = createWorkflow(
  "update-merchant-customer-segment",
  function (input: UpdateMerchantCustomerSegmentInput) {
    const scope = validateMerchantScopeStep(input)
    const current = retrieveMerchantCustomerSegmentStep({
      merchant_id: scope.merchant_id,
      segment_id: input.segment_id,
    })

    validateMerchantSegmentNameStep({
      merchant_id: scope.merchant_id,
      name: input.update.name,
      exclude_segment_id: input.segment_id,
    })
    const updateInput = transform(
      { input, scope, current },
      ({ input, scope, current }) => {
        const name = input.update.name ?? current.name
        const description =
          input.update.description === undefined
            ? current.description
            : input.update.description

        return {
          selector: { id: input.segment_id },
          update: {
            name: segmentGroupName(scope.merchant_id, name),
            metadata: segmentGroupMetadata({
              merchant_id: scope.merchant_id,
              name,
              description,
              metadata: current.metadata,
            }),
          },
        }
      }
    )

    updateCustomerGroupsWorkflow.runAsStep({ input: updateInput })

    const segment = retrieveMerchantCustomerSegmentStep({
      merchant_id: scope.merchant_id,
      segment_id: input.segment_id,
    }).config({ name: "retrieve-updated-merchant-customer-segment" })

    return new WorkflowResponse(segment)
  }
)

export const deleteMerchantCustomerSegmentWorkflow = createWorkflow(
  "delete-merchant-customer-segment",
  function (input: MerchantCustomerSegmentScope) {
    const scope = validateMerchantScopeStep(input)

    retrieveMerchantCustomerSegmentStep({
      merchant_id: scope.merchant_id,
      segment_id: input.segment_id,
    })
    const deleteInput = transform({ input }, ({ input }) => ({
      ids: [input.segment_id],
    }))

    deleteCustomerGroupsWorkflow.runAsStep({ input: deleteInput })

    const links = transform({ input, scope }, ({ input, scope }) => [
      {
        [MERCHANT_MODULE]: { merchant_id: scope.merchant_id },
        [Modules.CUSTOMER]: { customer_group_id: input.segment_id },
      },
    ])

    dismissRemoteLinkStep(links)

    const result = transform({ input }, ({ input }) => ({
      id: input.segment_id,
      object: "customer_segment",
      deleted: true,
    }))

    return new WorkflowResponse(result)
  }
)

export const manageMerchantCustomerSegmentCustomersWorkflow = createWorkflow(
  "manage-merchant-customer-segment-customers",
  function (input: ManageMerchantCustomerSegmentCustomersInput) {
    const scope = validateMerchantScopeStep(input)
    const current = retrieveMerchantCustomerSegmentStep({
      merchant_id: scope.merchant_id,
      segment_id: input.segment_id,
    })
    const changes = transform({ input, current }, ({ input, current }) => {
      const members = new Set(current.customers.map(({ id }) => id))

      return {
        add: Array.from(new Set(input.add ?? [])).filter(
          (id) => !members.has(id)
        ),
        remove: Array.from(new Set(input.remove ?? [])).filter((id) =>
          members.has(id)
        ),
      }
    })

    validateMerchantCustomersStep({
      merchant_id: scope.merchant_id,
      customer_ids: changes.add,
    })
    const linkInput = transform({ input, changes }, ({ input, changes }) => ({
      id: input.segment_id,
      add: changes.add,
      remove: changes.remove,
    }))

    linkCustomersToCustomerGroupWorkflow.runAsStep({ input: linkInput })

    const segment = retrieveMerchantCustomerSegmentStep({
      merchant_id: scope.merchant_id,
      segment_id: input.segment_id,
    }).config({ name: "retrieve-managed-merchant-customer-segment" })

    return new WorkflowResponse(segment)
  }
)

export const manageMerchantCustomerSegmentsWorkflow = createWorkflow(
  "manage-merchant-customer-segments",
  function (input: ManageMerchantCustomerSegmentsInput) {
    const scope = validateMerchantScopeStep(input)
    const customerIds = transform({ input }, ({ input }) => [
      input.customer_id,
    ])

    validateMerchantCustomersStep({
      merchant_id: scope.merchant_id,
      customer_ids: customerIds,
    })
    const requestedSegmentIds = transform({ input }, ({ input }) => [
      ...(input.add ?? []),
      ...(input.remove ?? []),
    ])

    validateMerchantSegmentIdsStep({
      merchant_id: scope.merchant_id,
      segment_ids: requestedSegmentIds,
    })
    const current = listCustomerSegmentMembershipsStep({
      merchant_id: scope.merchant_id,
      customer_id: input.customer_id,
    })
    const linkInput = transform({ input, current }, ({ input, current }) => {
      const memberships = new Set(current.map(({ id }) => id))

      return {
        id: input.customer_id,
        add: Array.from(new Set(input.add ?? [])).filter(
          (id) => !memberships.has(id)
        ),
        remove: Array.from(new Set(input.remove ?? [])).filter((id) =>
          memberships.has(id)
        ),
      }
    })

    linkCustomerGroupsToCustomerWorkflow.runAsStep({ input: linkInput })

    const segments = listCustomerSegmentMembershipsStep({
      merchant_id: scope.merchant_id,
      customer_id: input.customer_id,
    }).config({ name: "list-updated-customer-segment-memberships" })

    return new WorkflowResponse(segments)
  }
)
