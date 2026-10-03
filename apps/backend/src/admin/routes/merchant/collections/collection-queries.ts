import { useInvalidateCatalog } from "../../../lib/catalog-queries"
import { merchantQueryKeys } from "../../../lib/merchant-api"

export const collectionQueryKeys = {
  list: (merchantId: string) =>
    merchantQueryKeys.resource(merchantId, "collections"),
  detail: (merchantId: string, collectionId: string) =>
    merchantQueryKeys.resource(merchantId, `collections/${collectionId}`),
}

// Refreshes the collection pages and everywhere products show a collection.
export function useInvalidateCollections(merchantId: string) {
  const invalidate = useInvalidateCatalog(merchantId)

  return (collectionId?: string) =>
    invalidate([
      collectionQueryKeys.list(merchantId),
      ...(collectionId
        ? [collectionQueryKeys.detail(merchantId, collectionId)]
        : []),
    ])
}
