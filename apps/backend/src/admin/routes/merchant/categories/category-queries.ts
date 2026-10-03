import { useQueryClient } from "@tanstack/react-query"

import { useInvalidateCatalog } from "../../../lib/catalog-queries"
import { merchantQueryKeys } from "../../../lib/merchant-api"

export const categoryQueryKeys = {
  list: (merchantId: string) =>
    merchantQueryKeys.resource(merchantId, "categories"),
  detail: (merchantId: string, categoryId: string) =>
    merchantQueryKeys.resource(merchantId, `categories/${categoryId}`),
}

/**
 * Refreshes the category list, every category page (moving a category also
 * changes its old and new parent's pages), and everywhere products show
 * categories.
 */
export function useInvalidateCategories(merchantId: string) {
  const queryClient = useQueryClient()
  const invalidateCatalog = useInvalidateCatalog(merchantId)

  return () =>
    Promise.all([
      invalidateCatalog([categoryQueryKeys.list(merchantId)]),
      queryClient.invalidateQueries({
        predicate: ({ queryKey }) => {
          const [scope, id, resource] = queryKey

          return (
            scope === "merchant" &&
            id === merchantId &&
            typeof resource === "string" &&
            resource.startsWith("categories/")
          )
        },
      }),
    ])
}
