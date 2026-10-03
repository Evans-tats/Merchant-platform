import { type QueryKey, useQueryClient } from "@tanstack/react-query"

/**
 * Refreshes the given queries plus everything that shows a product's
 * collection or categories: product lists, product pages, and the product
 * forms' choices.
 */
export function useInvalidateCatalog(merchantId: string) {
  const queryClient = useQueryClient()

  return (queryKeys: QueryKey[]) =>
    Promise.all([
      ...queryKeys.map((queryKey) =>
        queryClient.invalidateQueries({ queryKey })
      ),
      queryClient.invalidateQueries({
        predicate: ({ queryKey }) => {
          const [scope, id, resource] = queryKey

          return (
            scope === "merchant" &&
            id === merchantId &&
            typeof resource === "string" &&
            (resource === "products" ||
              resource.startsWith("products/") ||
              resource === "product-references" ||
              resource === "product-create-references")
          )
        },
      }),
    ])
}
