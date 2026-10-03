import { EllipsisHorizontal, XMarkMini } from "@medusajs/icons"
import {
  Avatar,
  Button,
  Container,
  DataTable,
  DropdownMenu,
  FocusModal,
  Heading,
  IconButton,
  StatusBadge,
  Text,
  createDataTableColumnHelper,
  toast,
  useDataTable,
  usePrompt,
  type DataTableRowSelectionState,
} from "@medusajs/ui"
import {
  keepPreviousData,
  useMutation,
  useQuery,
  type QueryKey,
} from "@tanstack/react-query"
import { useDeferredValue, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"

import {
  errorMessage,
  merchantApi,
  type MerchantCollectionProduct,
  type MerchantProduct,
  type MerchantSession,
} from "../../lib/merchant-api"
import { statusColor } from "./merchant-page"

/** A collection or category, as far as its products section is concerned. */
export type CatalogGroup = {
  kind: "collection" | "category"
  id: string
  name: string
  product_count: number
  products: MerchantCollectionProduct[]
}

type ProductListResponse = {
  products: MerchantProduct[]
  count: number
}

const memberColumnHelper =
  createDataTableColumnHelper<MerchantCollectionProduct>()
const candidateColumnHelper = createDataTableColumnHelper<MerchantProduct>()

const ProductCell = ({
  title,
  thumbnail,
}: {
  title: string
  thumbnail?: string | null
}) => (
  <div className="flex items-center gap-3">
    <Avatar
      src={thumbnail ?? undefined}
      fallback={title.slice(0, 2).toUpperCase()}
      size="small"
      variant="squared"
    />
    <Text size="small" leading="compact" weight="plus" className="truncate">
      {title}
    </Text>
  </div>
)

const plural = (count: number) => `${count} product${count === 1 ? "" : "s"}`

const AddCatalogProductsModal = ({
  session,
  group,
  productsPath,
  queryKey,
  open,
  onOpenChange,
  onChanged,
}: {
  session: MerchantSession
  group: CatalogGroup
  productsPath: string
  queryKey: QueryKey
  open: boolean
  onOpenChange: (open: boolean) => void
  onChanged: () => Promise<unknown>
}) => {
  const [rowSelection, setRowSelection] = useState<DataTableRowSelectionState>(
    {}
  )
  const [search, setSearch] = useState("")
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 })
  const deferredSearch = useDeferredValue(search)
  const limit = pagination.pageSize
  const offset = pagination.pageIndex * limit
  const memberIds = useMemo(
    () => new Set(group.products.map(({ id }) => id)),
    [group.products]
  )
  const candidatesQuery = useQuery({
    queryKey: [...queryKey, "candidates", limit, offset, deferredSearch],
    queryFn: () => {
      const parameters = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
        order: "title",
      })

      if (deferredSearch.trim()) {
        parameters.set("q", deferredSearch.trim())
      }

      return merchantApi.get<ProductListResponse>(
        session.merchant.id,
        `/products?${parameters.toString()}`
      )
    },
    enabled: open,
    placeholderData: keepPreviousData,
  })
  const addProducts = useMutation({
    mutationFn: (productIds: string[]) =>
      merchantApi.post(session.merchant.id, productsPath, { add: productIds }),
    onSuccess: async (_, productIds) => {
      await onChanged()
      toast.success(`Added ${plural(productIds.length)} to ${group.name}`)
      setRowSelection({})
      onOpenChange(false)
    },
    onError: (error) => toast.error(errorMessage(error)),
  })
  const columns = useMemo(
    () => [
      candidateColumnHelper.select(),
      candidateColumnHelper.accessor("title", {
        header: "Product",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <ProductCell
              title={row.original.title}
              thumbnail={row.original.thumbnail}
            />
            {memberIds.has(row.original.id) && (
              <StatusBadge color="grey">In {group.kind}</StatusBadge>
            )}
          </div>
        ),
      }),
      candidateColumnHelper.accessor("status", {
        header: "Status",
        cell: ({ getValue }) => (
          <StatusBadge color={statusColor(getValue())}>
            {getValue()}
          </StatusBadge>
        ),
      }),
      // A product has one collection, so adding it to another moves it.
      ...(group.kind === "collection"
        ? [
            candidateColumnHelper.accessor(
              (product) => product.collection?.title ?? "-",
              { id: "collection", header: "Current collection" }
            ),
          ]
        : []),
    ],
    [group.kind, memberIds]
  )
  const table = useDataTable({
    columns,
    data: candidatesQuery.data?.products ?? [],
    getRowId: (product) => product.id,
    rowCount: candidatesQuery.data?.count ?? 0,
    isLoading: candidatesQuery.isPending,
    rowSelection: {
      state: rowSelection,
      onRowSelectionChange: setRowSelection,
      enableRowSelection: (row) => !memberIds.has(row.original.id),
    },
    search: {
      state: search,
      onSearchChange: (value) => {
        setSearch(value)
        setPagination((current) => ({ ...current, pageIndex: 0 }))
      },
    },
    pagination: {
      state: pagination,
      onPaginationChange: setPagination,
    },
  })
  const selectedIds = Object.keys(rowSelection).filter((id) => rowSelection[id])

  return (
    <FocusModal
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) setRowSelection({})
      }}
    >
      <FocusModal.Content>
        <div className="flex h-full flex-col overflow-hidden">
          <FocusModal.Header />
          <FocusModal.Body className="flex flex-1 flex-col overflow-hidden">
            <div className="px-6 py-4">
              <Heading>Add products to {group.name}</Heading>
              <Text size="small" className="text-ui-fg-subtle">
                {group.kind === "collection"
                  ? "A product belongs to one collection at a time. Adding a product from another collection moves it here."
                  : "A product can be in several categories. Adding it here keeps its other categories."}
              </Text>
            </div>
            <DataTable instance={table}>
              <DataTable.Toolbar>
                <div className="min-w-64 flex-1">
                  <DataTable.Search placeholder="Search products" />
                </div>
              </DataTable.Toolbar>
              <DataTable.Table
                emptyState={{
                  empty: {
                    heading: "No products yet",
                    description: "Create a product, then add it here.",
                  },
                  filtered: {
                    heading: "No matching products",
                    description: "Try another search.",
                  },
                }}
              />
              <DataTable.Pagination />
            </DataTable>
          </FocusModal.Body>
          <FocusModal.Footer>
            <div className="flex items-center justify-end gap-x-2">
              <FocusModal.Close asChild>
                <Button
                  size="small"
                  variant="secondary"
                  disabled={addProducts.isPending}
                >
                  Cancel
                </Button>
              </FocusModal.Close>
              <Button
                size="small"
                disabled={!selectedIds.length}
                isLoading={addProducts.isPending}
                onClick={() => addProducts.mutate(selectedIds)}
              >
                Add{selectedIds.length ? ` ${selectedIds.length}` : ""}
              </Button>
            </div>
          </FocusModal.Footer>
        </div>
      </FocusModal.Content>
    </FocusModal>
  )
}

/**
 * The products section of a collection or category page, as in Medusa: the
 * products in it, removing one, and adding more from the catalog.
 */
export const CatalogProductsSection = ({
  session,
  group,
  productsPath,
  queryKey,
  canEdit,
  onChanged,
}: {
  session: MerchantSession
  group: CatalogGroup
  // API path that adds and removes products, relative to the merchant.
  productsPath: string
  // The group's own query key; the add window's product list hangs off it.
  queryKey: QueryKey
  canEdit: boolean
  onChanged: () => Promise<unknown>
}) => {
  const navigate = useNavigate()
  const prompt = usePrompt()
  const [addOpen, setAddOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 })
  const removeProduct = useMutation({
    mutationFn: (product: MerchantCollectionProduct) =>
      merchantApi.post(session.merchant.id, productsPath, {
        remove: [product.id],
      }),
    onSuccess: async (_, product) => {
      await onChanged()
      toast.success(`Removed ${product.title} from ${group.name}`)
    },
    onError: (error) => toast.error(errorMessage(error)),
  })
  const { mutate: removeFromGroup, isPending: isRemoving } = removeProduct
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()

    return term
      ? group.products.filter(({ title, handle }) =>
          `${title} ${handle}`.toLowerCase().includes(term)
        )
      : group.products
  }, [search, group.products])
  const page = filtered.slice(
    pagination.pageIndex * pagination.pageSize,
    (pagination.pageIndex + 1) * pagination.pageSize
  )
  const columns = useMemo(
    () => [
      memberColumnHelper.accessor("title", {
        header: "Product",
        cell: ({ row }) => (
          <ProductCell
            title={row.original.title}
            thumbnail={row.original.thumbnail}
          />
        ),
      }),
      memberColumnHelper.accessor("status", {
        header: "Status",
        cell: ({ getValue }) => (
          <StatusBadge color={statusColor(getValue())}>
            {getValue()}
          </StatusBadge>
        ),
      }),
      ...(canEdit
        ? [
            memberColumnHelper.display({
              id: "actions",
              cell: ({ row }) => (
                <div
                  className="flex justify-end"
                  onClick={(event) => event.stopPropagation()}
                >
                  <DropdownMenu>
                    <DropdownMenu.Trigger asChild>
                      <IconButton
                        size="small"
                        variant="transparent"
                        aria-label={`Actions for ${row.original.title}`}
                        disabled={isRemoving}
                      >
                        <EllipsisHorizontal />
                      </IconButton>
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Content align="end">
                      <DropdownMenu.Item
                        className="gap-x-2"
                        onClick={async () => {
                          const confirmed = await prompt({
                            title: `Remove ${row.original.title}?`,
                            description:
                              "The product stays in your catalog. You can add it back at any time.",
                            confirmText: "Remove",
                            cancelText: "Cancel",
                          })

                          if (confirmed) removeFromGroup(row.original)
                        }}
                      >
                        <XMarkMini className="text-ui-fg-subtle" />
                        Remove from {group.kind}
                      </DropdownMenu.Item>
                    </DropdownMenu.Content>
                  </DropdownMenu>
                </div>
              ),
            }),
          ]
        : []),
    ],
    [canEdit, group.kind, isRemoving, prompt, removeFromGroup]
  )
  const table = useDataTable({
    columns,
    data: page,
    getRowId: (product) => product.id,
    rowCount: filtered.length,
    onRowClick: (_, product) => navigate(`/merchant-products/${product.id}`),
    search: {
      state: search,
      onSearchChange: (value) => {
        setSearch(value)
        setPagination((current) => ({ ...current, pageIndex: 0 }))
      },
    },
    pagination: {
      state: pagination,
      onPaginationChange: setPagination,
    },
  })

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <div>
          <Heading level="h2">Products</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {group.product_count} in this {group.kind}
          </Text>
        </div>
        {canEdit && (
          <Button
            size="small"
            variant="secondary"
            onClick={() => setAddOpen(true)}
          >
            Add products
          </Button>
        )}
      </div>
      <DataTable instance={table}>
        <DataTable.Toolbar>
          <div className="min-w-64 flex-1">
            <DataTable.Search
              placeholder={`Search products in this ${group.kind}`}
            />
          </div>
        </DataTable.Toolbar>
        <DataTable.Table
          emptyState={{
            empty: {
              heading: `No products in this ${group.kind}`,
              description:
                group.kind === "collection"
                  ? "Add products to show them together on your storefront."
                  : "Add products so shoppers find them when browsing this category.",
            },
            filtered: {
              heading: "No matching products",
              description: "Try another search.",
            },
          }}
        />
        <DataTable.Pagination />
      </DataTable>
      {canEdit && (
        <AddCatalogProductsModal
          session={session}
          group={group}
          productsPath={productsPath}
          queryKey={queryKey}
          open={addOpen}
          onOpenChange={setAddOpen}
          onChanged={onChanged}
        />
      )}
    </Container>
  )
}
