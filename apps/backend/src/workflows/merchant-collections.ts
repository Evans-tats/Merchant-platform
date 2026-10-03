import type { ProductTypes } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import {
  createWorkflow,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import {
  batchLinkProductsToCollectionWorkflow,
  createCollectionsWorkflow,
  createRemoteLinkStep,
  deleteCollectionsWorkflow,
  updateCollectionsWorkflow,
  useQueryGraphStep,
} from "@medusajs/medusa/core-flows"

import { MERCHANT_MODULE } from "../modules/merchant"
import { handleFromTitle } from "../services/merchant-handles"
import {
  listMerchantCollectionsStep,
  retrieveMerchantCollectionStep,
} from "./steps/merchant-collections"
import { resolveMerchantHandlesStep } from "./steps/resolve-merchant-handles"
import {
  type MerchantScopeInput,
  validateMerchantProductIdsStep,
  validateMerchantScopeStep,
} from "./steps/validate-merchant-commerce"

export type CreateMerchantCollectionsInput = MerchantScopeInput & {
  collections: ProductTypes.CreateProductCollectionDTO[]
}

type MerchantCollectionScope = MerchantScopeInput & {
  collection_id: string
}

export type UpdateMerchantCollectionInput = MerchantCollectionScope & {
  update: {
    title?: string
    handle?: string
  }
}

export type ManageMerchantCollectionProductsInput = MerchantCollectionScope & {
  add?: string[]
  remove?: string[]
}

export const listMerchantCollectionsWorkflow = createWorkflow(
  "list-merchant-collections",
  function (input: MerchantScopeInput) {
    const scope = validateMerchantScopeStep(input)
    const collections = listMerchantCollectionsStep({
      merchant_id: scope.merchant_id,
    })

    return new WorkflowResponse(collections)
  }
)

export const retrieveMerchantCollectionWorkflow = createWorkflow(
  "retrieve-merchant-collection",
  function (input: MerchantCollectionScope) {
    const scope = validateMerchantScopeStep(input)
    const collection = retrieveMerchantCollectionStep({
      merchant_id: scope.merchant_id,
      collection_id: input.collection_id,
    })

    return new WorkflowResponse(collection)
  }
)

export const createMerchantCollectionsWorkflow = createWorkflow(
  "create-merchant-collections",
  function (input: CreateMerchantCollectionsInput) {
    const scope = validateMerchantScopeStep(input)
    const productIds = transform({ input }, ({ input }) => {
      return Array.from(
        new Set(input.collections.flatMap(({ product_ids }) => {
          return product_ids ?? []
        }))
      )
    })

    validateMerchantProductIdsStep({
      scope,
      product_ids: productIds,
    })
    // Like Medusa, a collection without a handle gets one from its title.
    const requestedHandles = transform({ input }, ({ input }) =>
      input.collections.map((collection) => ({
        handle:
          collection.handle || handleFromTitle(collection.title, "collection"),
      }))
    )
    const handles = resolveMerchantHandlesStep({
      merchant_id: scope.merchant_id,
      entity: "product_collection",
      records: requestedHandles,
    })
    const collectionsInput = transform(
      { input, handles },
      ({ input, handles }) => ({
        collections: input.collections.map((collection, index) => ({
          ...collection,
          handle: handles[index],
        })),
      })
    )
    const collections = createCollectionsWorkflow.runAsStep({
      input: collectionsInput,
    })
    const collectionLinks = transform(
      { collections, scope },
      ({ collections, scope }) => {
        return collections.map((collection) => ({
          [MERCHANT_MODULE]: {
            merchant_id: scope.merchant_id,
          },
          [Modules.PRODUCT]: {
            product_collection_id: collection.id,
          },
        }))
      }
    )

    createRemoteLinkStep(collectionLinks)

    return new WorkflowResponse(collections)
  }
)

export const updateMerchantCollectionWorkflow = createWorkflow(
  "update-merchant-collection",
  function (input: UpdateMerchantCollectionInput) {
    const scope = validateMerchantScopeStep(input)

    retrieveMerchantCollectionStep({
      merchant_id: scope.merchant_id,
      collection_id: input.collection_id,
    })
    // A title change keeps the current handle; only a new handle is checked.
    const requestedHandles = transform({ input }, ({ input }) =>
      input.update.handle
        ? [{ record_id: input.collection_id, handle: input.update.handle }]
        : []
    )
    const handles = resolveMerchantHandlesStep({
      merchant_id: scope.merchant_id,
      entity: "product_collection",
      records: requestedHandles,
    })
    const updateInput = transform({ input, handles }, ({ input, handles }) => ({
      selector: { id: input.collection_id },
      update: {
        ...(input.update.title !== undefined && { title: input.update.title }),
        ...(handles[0] !== undefined && { handle: handles[0] }),
      },
    }))

    updateCollectionsWorkflow.runAsStep({ input: updateInput })

    const collection = retrieveMerchantCollectionStep({
      merchant_id: scope.merchant_id,
      collection_id: input.collection_id,
    }).config({ name: "retrieve-updated-merchant-collection" })

    return new WorkflowResponse(collection)
  }
)

export const deleteMerchantCollectionWorkflow = createWorkflow(
  "delete-merchant-collection",
  function (input: MerchantCollectionScope) {
    const scope = validateMerchantScopeStep(input)

    retrieveMerchantCollectionStep({
      merchant_id: scope.merchant_id,
      collection_id: input.collection_id,
    })
    const { data: collections } = useQueryGraphStep({
      entity: "product_collection",
      fields: ["id", "products.id"],
      filters: { id: input.collection_id },
    })
    // Medusa soft-deletes collections without clearing products'
    // collection_id. Detach the products first so none keep pointing at a
    // collection that no longer exists.
    const detachInput = transform(
      { input, collections },
      ({ input, collections }) => ({
        id: input.collection_id,
        remove: (collections[0]?.products ?? [])
          .map((product) => product?.id)
          .filter((id): id is string => Boolean(id)),
      })
    )

    batchLinkProductsToCollectionWorkflow.runAsStep({ input: detachInput })

    const deleteInput = transform({ input }, ({ input }) => ({
      ids: [input.collection_id],
    }))

    deleteCollectionsWorkflow.runAsStep({ input: deleteInput })

    const result = transform({ input }, ({ input }) => ({
      id: input.collection_id,
      object: "collection",
      deleted: true,
    }))

    return new WorkflowResponse(result)
  }
)

export const manageMerchantCollectionProductsWorkflow = createWorkflow(
  "manage-merchant-collection-products",
  function (input: ManageMerchantCollectionProductsInput) {
    const scope = validateMerchantScopeStep(input)
    const current = retrieveMerchantCollectionStep({
      merchant_id: scope.merchant_id,
      collection_id: input.collection_id,
    })
    const changes = transform({ input, current }, ({ input, current }) => {
      const members = new Set(current.products.map(({ id }) => id))

      return {
        add: Array.from(new Set(input.add ?? [])).filter(
          (id) => !members.has(id)
        ),
        remove: Array.from(new Set(input.remove ?? [])).filter((id) =>
          members.has(id)
        ),
      }
    })

    validateMerchantProductIdsStep({
      scope,
      product_ids: changes.add,
    })
    const linkInput = transform({ input, changes }, ({ input, changes }) => ({
      id: input.collection_id,
      add: changes.add,
      remove: changes.remove,
    }))

    batchLinkProductsToCollectionWorkflow.runAsStep({ input: linkInput })

    const collection = retrieveMerchantCollectionStep({
      merchant_id: scope.merchant_id,
      collection_id: input.collection_id,
    }).config({ name: "retrieve-managed-merchant-collection" })

    return new WorkflowResponse(collection)
  }
)
