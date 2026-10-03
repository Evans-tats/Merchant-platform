import { randomBytes } from "node:crypto"

import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  createStep,
  StepResponse,
} from "@medusajs/framework/workflows-sdk"

import {
  handleCandidates,
  pickMerchantHandle,
} from "../../services/merchant-handles"
import {
  listMerchantOwnedIds,
  type ResolvedMerchantId,
} from "../../services/tenant-resolution"

const resources = {
  product_collection: "collection",
  product_category: "category",
} as const

/**
 * Picks the handle each collection or category is saved with. Input handles
 * are already validated; a record_id marks an existing record keeping its
 * handle.
 */
export const resolveMerchantHandlesStep = createStep(
  "resolve-merchant-handles",
  async (
    input: {
      merchant_id: ResolvedMerchantId
      entity: keyof typeof resources
      records: Array<{ record_id?: string; handle: string }>
    },
    { container }
  ) => {
    if (!input.records.length) {
      return new StepResponse([] as string[])
    }

    const candidates = Array.from(
      new Set(input.records.flatMap(({ handle }) => handleCandidates(handle)))
    )
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: input.entity,
      fields: ["id", "handle"],
      filters: { handle: candidates },
    })
    const ownedIds = new Set(
      await listMerchantOwnedIds(container, input.merchant_id, input.entity)
    )
    const holders = (data as unknown as Array<{ id: string; handle: string }>)
      .map(({ id, handle }) => ({ id, handle, owned: ownedIds.has(id) }))
    const handles: string[] = []

    for (const record of input.records) {
      handles.push(
        pickMerchantHandle({
          resource: resources[input.entity],
          requested: record.handle,
          record_id: record.record_id,
          holders,
          reserved: handles,
          randomSuffix: () => randomBytes(3).toString("hex"),
        })
      )
    }

    return new StepResponse(handles)
  }
)
