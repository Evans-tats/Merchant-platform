import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import {
  createStep,
  StepResponse,
} from "@medusajs/framework/workflows-sdk"

import {
  listMerchantOwnedIds,
  type ResolvedMerchantId,
} from "../../services/tenant-resolution"

type CollectionGraph = {
  id: string
  title: string
  handle: string
  created_at: string | Date
  updated_at: string | Date
  merchant?: { id: string } | null
  products?: Array<{ id: string } | null> | null
}

type CollectionProductGraph = {
  id: string
  title: string
  handle: string
  status: string
  thumbnail: string | null
  merchant?: { id: string } | null
}

export type MerchantCollection = {
  id: string
  title: string
  handle: string
  product_count: number
  created_at: string | Date
  updated_at: string | Date
}

export type MerchantCollectionProduct = Omit<CollectionProductGraph, "merchant">

export type MerchantCollectionDetail = MerchantCollection & {
  products: MerchantCollectionProduct[]
}

function collectionNotFound() {
  return new MedusaError(MedusaError.Types.NOT_FOUND, "Collection not found")
}

function productIdsOf(collection: CollectionGraph): string[] {
  return (collection.products ?? [])
    .map((product) => product?.id)
    .filter((id): id is string => Boolean(id))
}

export const listMerchantCollectionsStep = createStep(
  "list-merchant-collections",
  async (input: { merchant_id: ResolvedMerchantId }, { container }) => {
    const ids = await listMerchantOwnedIds(
      container,
      input.merchant_id,
      "product_collection"
    )

    if (!ids.length) {
      return new StepResponse({
        collections: [] as MerchantCollection[],
        count: 0,
      })
    }

    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "product_collection",
      fields: [
        "id",
        "title",
        "handle",
        "created_at",
        "updated_at",
        "products.id",
      ],
      filters: { id: ids },
    })
    const collections = (data as unknown as CollectionGraph[])
      .map(
        (collection): MerchantCollection => ({
          id: collection.id,
          title: collection.title,
          handle: collection.handle,
          product_count: productIdsOf(collection).length,
          created_at: collection.created_at,
          updated_at: collection.updated_at,
        })
      )
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )

    return new StepResponse({ collections, count: collections.length })
  }
)

/**
 * Returns the collection only when the merchant owns it, and lists only the
 * merchant's own products in it.
 */
export const retrieveMerchantCollectionStep = createStep(
  "retrieve-merchant-collection",
  async (
    input: { merchant_id: ResolvedMerchantId; collection_id: string },
    { container }
  ) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "product_collection",
      fields: [
        "id",
        "title",
        "handle",
        "created_at",
        "updated_at",
        "merchant.id",
        "products.id",
      ],
      filters: { id: input.collection_id },
    })
    const collection = (data as unknown as CollectionGraph[])[0]

    if (!collection || collection.merchant?.id !== input.merchant_id) {
      throw collectionNotFound()
    }

    const productIds = productIdsOf(collection)
    let products: MerchantCollectionProduct[] = []

    if (productIds.length) {
      const { data: productData } = await query.graph({
        entity: "product",
        fields: ["id", "title", "handle", "status", "thumbnail", "merchant.id"],
        filters: { id: productIds },
      })

      products = (productData as unknown as CollectionProductGraph[])
        .filter(({ merchant }) => merchant?.id === input.merchant_id)
        .map(({ id, title, handle, status, thumbnail }) => ({
          id,
          title,
          handle,
          status,
          thumbnail,
        }))
        .sort((a, b) => a.title.localeCompare(b.title))
    }

    const detail: MerchantCollectionDetail = {
      id: collection.id,
      title: collection.title,
      handle: collection.handle,
      product_count: products.length,
      products,
      created_at: collection.created_at,
      updated_at: collection.updated_at,
    }

    return new StepResponse(detail)
  }
)
