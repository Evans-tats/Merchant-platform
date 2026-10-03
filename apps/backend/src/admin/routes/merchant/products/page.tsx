import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Plus } from "@medusajs/icons"
import {
  Avatar,
  Button,
  Container,
  DataTable,
  type DataTablePaginationState,
  Select,
  StatusBadge,
  Text,
  createDataTableColumnHelper,
  useDataTable,
} from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"

import {
  MerchantPageHeader,
  MerchantRoute,
  statusColor,
} from "../../../components/merchant/merchant-page"
import {
  canManageMerchant,
  formatDate,
  merchantApi,
  merchantQueryKeys,
  type MerchantProduct,
  type MerchantSession,
} from "../../../lib/merchant-api"
import { ProductCreateModal } from "./product-create-modal"

const columnHelper = createDataTableColumnHelper<MerchantProduct>()

type ProductsResponse = {
  products: MerchantProduct[]
  count: number
  limit: number
  offset: number
}

const MerchantProductsContent = ({ session }: { session: MerchantSession }) => {
  const navigate = useNavigate()
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState("all")
  const [order, setOrder] = useState("-created_at")
  const [createOpen, setCreateOpen] = useState(false)
  const [pagination, setPagination] = useState<DataTablePaginationState>({
    pageIndex: 0,
    pageSize: 20,
  })
  const queryKey = [
    ...merchantQueryKeys.resource(session.merchant.id, "products"),
    {
      search,
      status,
      order,
      pageIndex: pagination.pageIndex,
      pageSize: pagination.pageSize,
    },
  ] as const
  const productsQuery = useQuery({
    queryKey,
    queryFn: () => {
      const params = new URLSearchParams({
        limit: String(pagination.pageSize),
        offset: String(pagination.pageIndex * pagination.pageSize),
        order,
      })
      if (search.trim()) params.set("q", search.trim())
      if (status !== "all") params.set("status", status)

      return merchantApi.get<ProductsResponse>(
        session.merchant.id,
        `/products?${params.toString()}`
      )
    },
  })
  const products = productsQuery.data?.products ?? []
  const columns = useMemo(
    () => [
      columnHelper.accessor("title", {
        header: "Product",
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <Avatar
              src={row.original.thumbnail ?? undefined}
              fallback={row.original.title.slice(0, 2).toUpperCase()}
              size="small"
              variant="squared"
            />
            <div className="min-w-0">
              <Text size="small" weight="plus" className="truncate">
                {row.original.title}
              </Text>
              <Text size="xsmall" className="text-ui-fg-subtle truncate">
                /{row.original.handle}
              </Text>
            </div>
          </div>
        ),
      }),
      columnHelper.accessor("status", {
        header: "Status",
        cell: ({ getValue }) => (
          <StatusBadge color={statusColor(getValue())}>
            {getValue()}
          </StatusBadge>
        ),
      }),
      columnHelper.accessor((product) => product.collection?.title ?? "—", {
        id: "collection",
        header: "Collection",
      }),
      columnHelper.accessor((product) => product.variants?.length ?? 0, {
        id: "variants",
        header: "Variants",
      }),
      columnHelper.accessor("created_at", {
        header: "Created",
        cell: ({ getValue }) => formatDate(getValue()),
      }),
    ],
    []
  )
  const table = useDataTable({
    columns,
    data: products,
    getRowId: (product) => product.id,
    rowCount: productsQuery.data?.count ?? 0,
    isLoading: productsQuery.isPending,
    search: {
      state: search,
      onSearchChange: (value) => {
        setSearch(value)
        setPagination((current) => ({ ...current, pageIndex: 0 }))
      },
      debounce: 300,
    },
    pagination: {
      state: pagination,
      onPaginationChange: setPagination,
    },
      onRowClick: (_event, product) => navigate(`/merchant-products/${product.id}`),
  })

  if (productsQuery.isError) {
    throw productsQuery.error
  }

  return (
    <>
      <Container className="divide-y p-0">
        <MerchantPageHeader
          title="Products"
          subtitle={`Catalog for ${session.merchant.name}`}
          actions={canManageMerchant(session.member.role) ? (
            <Button size="small" onClick={() => setCreateOpen(true)}>
              <Plus /> Create product
            </Button>
          ) : undefined}
        />
        <DataTable instance={table}>
          <DataTable.Toolbar>
            <div className="flex w-full flex-wrap items-center gap-2">
              <div className="min-w-64 flex-1">
                <DataTable.Search placeholder="Search products" />
              </div>
              <Select value={status} onValueChange={(value) => {
                setStatus(value)
                setPagination((current) => ({ ...current, pageIndex: 0 }))
              }}>
                <Select.Trigger className="w-36"><Select.Value /></Select.Trigger>
                <Select.Content>
                  <Select.Item value="all">All statuses</Select.Item>
                  <Select.Item value="published">Published</Select.Item>
                  <Select.Item value="draft">Draft</Select.Item>
                  <Select.Item value="proposed">Proposed</Select.Item>
                  <Select.Item value="rejected">Rejected</Select.Item>
                </Select.Content>
              </Select>
              <Select value={order} onValueChange={(value) => {
                setOrder(value)
                setPagination((current) => ({ ...current, pageIndex: 0 }))
              }}>
                <Select.Trigger className="w-40"><Select.Value /></Select.Trigger>
                <Select.Content>
                  <Select.Item value="-created_at">Newest first</Select.Item>
                  <Select.Item value="created_at">Oldest first</Select.Item>
                  <Select.Item value="title">Title A–Z</Select.Item>
                  <Select.Item value="-title">Title Z–A</Select.Item>
                </Select.Content>
              </Select>
            </div>
          </DataTable.Toolbar>
          <DataTable.Table
            emptyState={{
              empty: {
                heading: "No products yet",
                description: "Create the first product for this merchant.",
              },
              filtered: {
                heading: "No matching products",
                description: "Change the search or status filter.",
              },
            }}
          />
          <DataTable.Pagination />
        </DataTable>
      </Container>
      <ProductCreateModal
        session={session}
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
    </>
  )
}

const MerchantProductsPage = () => (
  <MerchantRoute>
    {(session) => <MerchantProductsContent session={session} />}
  </MerchantRoute>
)

export const config = defineRouteConfig({})

export const handle = {
  breadcrumb: () => "Products",
}

export default MerchantProductsPage
