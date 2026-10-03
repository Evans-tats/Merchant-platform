import { defineRouteConfig } from "@medusajs/admin-sdk"
import { TriangleDownMini, TriangleRightMini } from "@medusajs/icons"
import {
  Button,
  Container,
  DataTable,
  IconButton,
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
  type MerchantCategoryListItem,
  type MerchantCategoryListResponse,
  type MerchantSession,
} from "../../../lib/merchant-api"
import { categoryQueryKeys } from "./category-queries"
import { CategoryStatusBadges } from "./category-badges"
import { visibleCategoryRows } from "./category-tree"
import { CreateCategoryModal } from "./create-category-modal"
import { OrganizeCategoriesModal } from "./organize-categories-modal"

const columnHelper = createDataTableColumnHelper<
  MerchantCategoryListItem & { indent: number; childCount: number }
>()

const MerchantCategoriesContent = ({
  session,
}: {
  session: MerchantSession
}) => {
  const navigate = useNavigate()
  const [createOpen, setCreateOpen] = useState(false)
  const [organizeOpen, setOrganizeOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 50 })
  const canEdit = canManageMerchant(session.member.role)
  const categoriesQuery = useQuery({
    queryKey: categoryQueryKeys.list(session.merchant.id),
    queryFn: () =>
      merchantApi.get<MerchantCategoryListResponse>(
        session.merchant.id,
        "/categories"
      ),
  })
  // A store has few categories, so the whole tree loads at once and search
  // and paging happen here.
  const rows = useMemo(
    () =>
      visibleCategoryRows(
        categoriesQuery.data?.product_categories ?? [],
        collapsed,
        search
      ),
    [categoriesQuery.data, collapsed, search]
  )
  const page = rows.slice(
    pagination.pageIndex * pagination.pageSize,
    (pagination.pageIndex + 1) * pagination.pageSize
  )
  const columns = useMemo(
    () => [
      columnHelper.accessor("name", {
        header: "Title",
        cell: ({ row }) => {
          const { id, name, indent, childCount } = row.original
          const isCollapsed = collapsed.has(id)

          return (
            <div
              className="flex items-center gap-x-1"
              style={{ paddingLeft: `${indent * 24}px` }}
            >
              {childCount ? (
                <IconButton
                  size="2xsmall"
                  variant="transparent"
                  aria-label={`${isCollapsed ? "Show" : "Hide"} subcategories of ${name}`}
                  onClick={(event) => {
                    event.stopPropagation()
                    setCollapsed((current) => {
                      const next = new Set(current)

                      if (isCollapsed) {
                        next.delete(id)
                      } else {
                        next.add(id)
                      }

                      return next
                    })
                  }}
                >
                  {isCollapsed ? <TriangleRightMini /> : <TriangleDownMini />}
                </IconButton>
              ) : (
                <span className="inline-block w-6" />
              )}
              <Text size="small" leading="compact" weight="plus">
                {name}
              </Text>
            </div>
          )
        },
      }),
      columnHelper.accessor("handle", {
        header: "Handle",
        cell: ({ getValue }) => `/${getValue()}`,
      }),
      columnHelper.display({
        id: "status",
        header: "Status",
        cell: ({ row }) => <CategoryStatusBadges category={row.original} />,
      }),
      columnHelper.accessor("product_count", {
        header: "Products",
      }),
    ],
    [collapsed]
  )
  const table = useDataTable({
    columns,
    data: page,
    getRowId: (category) => category.id,
    rowCount: rows.length,
    isLoading: categoriesQuery.isPending,
    onRowClick: (_, category) =>
      navigate(`/merchant-categories/${category.id}`),
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

  if (categoriesQuery.isError) {
    throw categoriesQuery.error
  }

  return (
    <Container className="divide-y p-0">
      <MerchantPageHeader
        title="Categories"
        subtitle="Organize this merchant's products into a clear hierarchy"
        actions={
          canEdit && (
            <>
              <Button
                size="small"
                variant="secondary"
                onClick={() => setOrganizeOpen(true)}
              >
                Edit ranking
              </Button>
              <Button
                size="small"
                variant="secondary"
                onClick={() => setCreateOpen(true)}
              >
                Create
              </Button>
            </>
          )
        }
      />
      <DataTable instance={table}>
        <DataTable.Toolbar>
          <div className="min-w-64 flex-1">
            <DataTable.Search placeholder="Search categories" />
          </div>
        </DataTable.Toolbar>
        <DataTable.Table
          emptyState={{
            empty: {
              heading: "No categories",
              description:
                "Create categories like Women, Men, or Accessories so shoppers can browse your products.",
            },
            filtered: {
              heading: "No matching categories",
              description: "Try another search.",
            },
          }}
        />
        <DataTable.Pagination />
      </DataTable>
      {canEdit && (
        <>
          <CreateCategoryModal
            session={session}
            open={createOpen}
            onOpenChange={setCreateOpen}
          />
          <OrganizeCategoriesModal
            session={session}
            open={organizeOpen}
            onOpenChange={setOrganizeOpen}
          />
        </>
      )}
    </Container>
  )
}

const MerchantCategoriesPage = () => (
  <MerchantRoute>
    {(session) => <MerchantCategoriesContent session={session} />}
  </MerchantRoute>
)

export const config = defineRouteConfig({})

export const handle = {
  breadcrumb: () => "Categories",
}

export default MerchantCategoriesPage
