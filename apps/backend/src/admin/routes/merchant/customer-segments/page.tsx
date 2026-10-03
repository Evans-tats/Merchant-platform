import { defineRouteConfig } from "@medusajs/admin-sdk"
import {
  Button,
  Container,
  DataTable,
  FocusModal,
  Heading,
  Text,
  createDataTableColumnHelper,
  toast,
  useDataTable,
} from "@medusajs/ui"
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { useDeferredValue, useMemo, useState } from "react"
import { Link, useNavigate } from "react-router-dom"

import {
  MerchantPageHeader,
  MerchantRoute,
} from "../../../components/merchant/merchant-page"
import {
  canManageMerchant,
  errorMessage,
  formatDate,
  merchantApi,
  merchantQueryKeys,
  type MerchantCustomerSegment,
  type MerchantCustomerSegmentListResponse,
  type MerchantSession,
} from "../../../lib/merchant-api"
import {
  SegmentFormFields,
  readSegmentForm,
  type SegmentFormValues,
} from "./segment-form-fields"

const columnHelper = createDataTableColumnHelper<MerchantCustomerSegment>()

function segmentListSuffix(input: {
  search: string
  limit: number
  offset: number
}) {
  const parameters = new URLSearchParams({
    limit: String(input.limit),
    offset: String(input.offset),
  })

  if (input.search.trim()) {
    parameters.set("q", input.search.trim())
  }

  return `/customer-segments?${parameters.toString()}`
}

const CreateSegmentModal = ({
  session,
  open,
  onOpenChange,
}: {
  session: MerchantSession
  open: boolean
  onOpenChange: (open: boolean) => void
}) => {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const createSegment = useMutation({
    mutationFn: (values: SegmentFormValues) =>
      merchantApi.post<{ customer_segment: MerchantCustomerSegment }>(
        session.merchant.id,
        "/customer-segments",
        values
      ),
    onSuccess: async ({ customer_segment }) => {
      await queryClient.invalidateQueries({
        queryKey: merchantQueryKeys.resource(
          session.merchant.id,
          "customer-segments"
        ),
      })
      toast.success(`Created segment ${customer_segment.name}`)
      onOpenChange(false)
      navigate(`/merchant-customer-segments/${customer_segment.id}`)
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  return (
    <FocusModal open={open} onOpenChange={onOpenChange}>
      <FocusModal.Content>
        <form
          className="flex h-full flex-col overflow-hidden"
          onSubmit={(event) => {
            event.preventDefault()
            createSegment.mutate(readSegmentForm(event.currentTarget))
          }}
        >
          <FocusModal.Header>
            <div className="flex items-center justify-end gap-x-2">
              <FocusModal.Close asChild>
                <Button
                  size="small"
                  variant="secondary"
                  type="button"
                  disabled={createSegment.isPending}
                >
                  Cancel
                </Button>
              </FocusModal.Close>
              <Button
                size="small"
                type="submit"
                isLoading={createSegment.isPending}
              >
                Create
              </Button>
            </div>
          </FocusModal.Header>
          <FocusModal.Body className="flex flex-1 justify-center overflow-y-auto px-6 py-16">
            <div className="flex w-full max-w-lg flex-col gap-y-8">
              <div className="flex flex-col gap-y-1">
                <Heading>Create customer segment</Heading>
                <Text size="small" className="text-ui-fg-subtle">
                  Group customers so you can find, export, and target them
                  together.
                </Text>
              </div>
              <SegmentFormFields />
            </div>
          </FocusModal.Body>
        </form>
      </FocusModal.Content>
    </FocusModal>
  )
}

const MerchantCustomerSegmentsContent = ({
  session,
}: {
  session: MerchantSession
}) => {
  const [search, setSearch] = useState("")
  const [createOpen, setCreateOpen] = useState(false)
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 20,
  })
  const deferredSearch = useDeferredValue(search)
  const limit = pagination.pageSize
  const offset = pagination.pageIndex * limit
  const canEdit = canManageMerchant(session.member.role)
  const segmentsQuery = useQuery({
    queryKey: [
      ...merchantQueryKeys.resource(session.merchant.id, "customer-segments"),
      limit,
      offset,
      deferredSearch,
    ],
    queryFn: () =>
      merchantApi.get<MerchantCustomerSegmentListResponse>(
        session.merchant.id,
        segmentListSuffix({ search: deferredSearch, limit, offset })
      ),
    placeholderData: keepPreviousData,
  })
  const columns = useMemo(
    () => [
      columnHelper.accessor("name", {
        header: "Segment",
        cell: ({ row, getValue }) => (
          <Link
            className="text-ui-fg-interactive font-medium"
            to={`/merchant-customer-segments/${row.original.id}`}
          >
            {getValue()}
          </Link>
        ),
      }),
      columnHelper.accessor("description", {
        header: "Description",
        cell: ({ getValue }) => (
          <Text
            size="small"
            leading="compact"
            className="text-ui-fg-subtle max-w-md truncate"
          >
            {getValue() || "-"}
          </Text>
        ),
      }),
      columnHelper.accessor("customer_count", {
        header: "Customers",
      }),
      columnHelper.accessor("updated_at", {
        header: "Updated",
        cell: ({ getValue }) => formatDate(getValue() ?? undefined),
      }),
    ],
    []
  )
  const table = useDataTable({
    columns,
    data: segmentsQuery.data?.customer_segments ?? [],
    getRowId: (segment) => segment.id,
    rowCount: segmentsQuery.data?.count ?? 0,
    isLoading: segmentsQuery.isPending,
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

  if (segmentsQuery.isError) {
    throw segmentsQuery.error
  }

  return (
    <Container className="divide-y p-0">
      <MerchantPageHeader
        title="Customer segments"
        subtitle={`Groups of customers at ${session.merchant.name}`}
        actions={
          canEdit && (
            <Button
              size="small"
              variant="secondary"
              onClick={() => setCreateOpen(true)}
            >
              Create segment
            </Button>
          )
        }
      />
      <DataTable instance={table}>
        <DataTable.Toolbar>
          <div className="min-w-64 flex-1">
            <DataTable.Search placeholder="Search segments" />
          </div>
        </DataTable.Toolbar>
        <DataTable.Table
          emptyState={{
            empty: {
              heading: "No customer segments yet",
              description:
                "Create a segment such as VIP or Wholesale, then add customers to it.",
            },
            filtered: {
              heading: "No matching segments",
              description: "Try another search.",
            },
          }}
        />
        <DataTable.Pagination />
      </DataTable>
      {canEdit && (
        <CreateSegmentModal
          session={session}
          open={createOpen}
          onOpenChange={setCreateOpen}
        />
      )}
    </Container>
  )
}

const MerchantCustomerSegmentsPage = () => {
  return (
    <MerchantRoute>
      {(session) => <MerchantCustomerSegmentsContent session={session} />}
    </MerchantRoute>
  )
}

export const config = defineRouteConfig({})

export const handle = {
  breadcrumb: () => "Customer segments",
}

export default MerchantCustomerSegmentsPage
