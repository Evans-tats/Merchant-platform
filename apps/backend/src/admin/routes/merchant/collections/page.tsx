import { defineRouteConfig } from "@medusajs/admin-sdk"
import {
  Button,
  Container,
  DataTable,
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
} from "../../../components/merchant/merchant-page"
import {
  canManageMerchant,
  merchantApi,
  type MerchantCollection,
  type MerchantCollectionListResponse,
  type MerchantSession,
} from "../../../lib/merchant-api"
import { collectionQueryKeys } from "./collection-queries"
import { CreateCollectionModal } from "./create-collection-modal"

const columnHelper = createDataTableColumnHelper<MerchantCollection>()

const columns = [
  columnHelper.accessor("title", {
    header: "Title",
    cell: ({ getValue }) => (
      <Text size="small" leading="compact" weight="plus">
        {getValue()}
      </Text>
    ),
  }),
  columnHelper.accessor("handle", {
    header: "Handle",
    cell: ({ getValue }) => `/${getValue()}`,
  }),
  columnHelper.accessor("product_count", {
    header: "Products",
  }),
]

const MerchantCollectionsContent = ({
  session,
}: {
  session: MerchantSession
}) => {
  const navigate = useNavigate()
  const [createOpen, setCreateOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 })
  const canEdit = canManageMerchant(session.member.role)
  const collectionsQuery = useQuery({
    queryKey: collectionQueryKeys.list(session.merchant.id),
    queryFn: () =>
      merchantApi.get<MerchantCollectionListResponse>(
        session.merchant.id,
        "/collections"
      ),
  })
  // A store has few collections, so the full list loads at once and search
  // and paging happen here.
  const filtered = useMemo(() => {
    const collections = collectionsQuery.data?.collections ?? []
    const term = search.trim().toLowerCase()

    return term
      ? collections.filter(({ title, handle }) =>
          `${title} ${handle}`.toLowerCase().includes(term)
        )
      : collections
  }, [collectionsQuery.data, search])
  const page = filtered.slice(
    pagination.pageIndex * pagination.pageSize,
    (pagination.pageIndex + 1) * pagination.pageSize
  )
  const table = useDataTable({
    columns,
    data: page,
    getRowId: (collection) => collection.id,
    rowCount: filtered.length,
    isLoading: collectionsQuery.isPending,
    onRowClick: (_, collection) =>
      navigate(`/merchant-collections/${collection.id}`),
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

  if (collectionsQuery.isError) {
    throw collectionsQuery.error
  }

  return (
    <Container className="divide-y p-0">
      <MerchantPageHeader
        title="Collections"
        subtitle="Curate groups of products for this merchant's storefront"
        actions={
          canEdit && (
            <Button
              size="small"
              variant="secondary"
              onClick={() => setCreateOpen(true)}
            >
              Create
            </Button>
          )
        }
      />
      <DataTable instance={table}>
        <DataTable.Toolbar>
          <div className="min-w-64 flex-1">
            <DataTable.Search placeholder="Search collections" />
          </div>
        </DataTable.Toolbar>
        <DataTable.Table
          emptyState={{
            empty: {
              heading: "No collections",
              description:
                "Create a collection to group products for your storefront.",
            },
            filtered: {
              heading: "No matching collections",
              description: "Try another search.",
            },
          }}
        />
        <DataTable.Pagination />
      </DataTable>
      {canEdit && (
        <CreateCollectionModal
          session={session}
          open={createOpen}
          onOpenChange={setCreateOpen}
        />
      )}
    </Container>
  )
}

const MerchantCollectionsPage = () => (
  <MerchantRoute>
    {(session) => <MerchantCollectionsContent session={session} />}
  </MerchantRoute>
)

export const config = defineRouteConfig({})

export const handle = {
  breadcrumb: () => "Collections",
}

export default MerchantCollectionsPage
