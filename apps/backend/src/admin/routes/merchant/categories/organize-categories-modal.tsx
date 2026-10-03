import { Spinner } from "@medusajs/icons"
import { FocusModal, Heading, Text, toast } from "@medusajs/ui"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useEffect, useState } from "react"

import { SortableTree } from "../../../components/merchant/sortable-tree"
import {
  errorMessage,
  merchantApi,
  type MerchantCategoryListResponse,
  type MerchantSession,
} from "../../../lib/merchant-api"
import { categoryQueryKeys, useInvalidateCategories } from "./category-queries"
import { nestCategories, type NestedCategory } from "./category-tree"

/**
 * Medusa's "Edit ranking" view: drag categories to reorder them, or drag one
 * sideways to move it in or out of another category. Each drop saves at once.
 */
export const OrganizeCategoriesModal = ({
  session,
  open,
  onOpenChange,
}: {
  session: MerchantSession
  open: boolean
  onOpenChange: (open: boolean) => void
}) => {
  const invalidate = useInvalidateCategories(session.merchant.id)
  const categoriesQuery = useQuery({
    queryKey: categoryQueryKeys.list(session.merchant.id),
    queryFn: () =>
      merchantApi.get<MerchantCategoryListResponse>(
        session.merchant.id,
        "/categories"
      ),
    enabled: open,
  })
  const [tree, setTree] = useState<NestedCategory[]>([])
  const moveCategory = useMutation({
    mutationFn: (move: {
      id: string
      parent_category_id: string | null
      rank: number
    }) =>
      merchantApi.post(session.merchant.id, `/categories/${move.id}`, {
        parent_category_id: move.parent_category_id,
        rank: move.rank,
      }),
    onError: (error) => {
      // Put the tree back the way the server has it.
      setTree(nestCategories(categoriesQuery.data?.product_categories ?? []))
      toast.error(errorMessage(error))
    },
    onSettled: () => invalidate(),
  })

  useEffect(() => {
    if (categoriesQuery.data && !moveCategory.isPending) {
      setTree(nestCategories(categoriesQuery.data.product_categories))
    }
  }, [categoriesQuery.data, moveCategory.isPending])

  if (categoriesQuery.isError) {
    throw categoriesQuery.error
  }

  return (
    <FocusModal open={open} onOpenChange={onOpenChange}>
      <FocusModal.Content>
        <div className="flex h-full flex-col overflow-hidden">
          <FocusModal.Header>
            <div className="flex items-center justify-end">
              {(categoriesQuery.isFetching || moveCategory.isPending) && (
                <Spinner className="text-ui-fg-subtle animate-spin" />
              )}
            </div>
          </FocusModal.Header>
          <FocusModal.Body className="bg-ui-bg-subtle flex flex-1 flex-col overflow-y-auto">
            <div className="bg-ui-bg-base border-b px-6 py-4">
              <Heading>Edit ranking</Heading>
              <Text size="small" className="text-ui-fg-subtle">
                Drag a category up or down to change its order on your
                storefront. Drag it right to put it inside the category above,
                or left to move it out.
              </Text>
            </div>
            {categoriesQuery.isPending ? (
              <div className="flex flex-1 items-center justify-center">
                <Spinner className="text-ui-fg-subtle animate-spin" />
              </div>
            ) : tree.length ? (
              <SortableTree
                items={tree}
                childrenProp="category_children"
                collapsible
                enableDrag={!moveCategory.isPending}
                renderValue={(item) => item.name}
                onChange={(update, items) => {
                  setTree(items)
                  moveCategory.mutate({
                    id: String(update.id),
                    parent_category_id:
                      update.parentId === null ? null : String(update.parentId),
                    rank: update.index,
                  })
                }}
              />
            ) : (
              <div className="flex flex-1 items-center justify-center">
                <Text size="small" className="text-ui-fg-subtle">
                  Create a category first, then come back to arrange them.
                </Text>
              </div>
            )}
          </FocusModal.Body>
        </div>
      </FocusModal.Content>
    </FocusModal>
  )
}
