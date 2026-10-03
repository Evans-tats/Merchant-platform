import {
  Button,
  Container,
  DataTable,
  Drawer,
  FocusModal,
  Heading,
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
  useQueryClient,
} from "@tanstack/react-query"
import { useDeferredValue, useMemo, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"

import {
  MerchantPageSkeleton,
  MerchantRoute,
} from "../../../../components/merchant/merchant-page"
import {
  canManageMerchant,
  errorMessage,
  merchantApi,
  merchantQueryKeys,
  type MerchantCustomerListItem,
  type MerchantCustomerSegmentDetail,
  type MerchantCustomerSegmentMember,
  type MerchantSession,
} from "../../../../lib/merchant-api"
import {
  SegmentFormFields,
  readSegmentForm,
  type SegmentFormValues,
} from "../segment-form-fields"

type CustomerListResponse = {
  customers: MerchantCustomerListItem[]
  count: number
}

const memberColumnHelper =
  createDataTableColumnHelper<MerchantCustomerSegmentMember>()
const candidateColumnHelper =
  createDataTableColumnHelper<MerchantCustomerListItem>()

function personName(customer: {
  first_name: string | null
  last_name: string | null
  email: string | null
}) {
  return (
    [customer.first_name, customer.last_name].filter(Boolean).join(" ") ||
    customer.email ||
    "Customer"
  )
}

function useSegmentInvalidation(merchantId: string, segmentId: string) {
  const queryClient = useQueryClient()

  return () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: merchantQueryKeys.resource(
          merchantId,
          `customer-segments/${segmentId}`
        ),
      }),
      queryClient.invalidateQueries({
        queryKey: merchantQueryKeys.resource(merchantId, "customer-segments"),
      }),
      queryClient.invalidateQueries({
        queryKey: merchantQueryKeys.resource(merchantId, "customers"),
      }),
    ])
}

const EditSegmentDrawer = ({
  session,
  segment,
  open,
  onOpenChange,
}: {
  session: MerchantSession
  segment: MerchantCustomerSegmentDetail
  open: boolean
  onOpenChange: (open: boolean) => void
}) => {
  const invalidate = useSegmentInvalidation(session.merchant.id, segment.id)
  const updateSegment = useMutation({
    mutationFn: (values: SegmentFormValues) =>
      merchantApi.post(
        session.merchant.id,
        `/customer-segments/${segment.id}`,
        values
      ),
    onSuccess: async () => {
      await invalidate()
      toast.success("Segment updated")
      onOpenChange(false)
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <Drawer.Content>
        <form
          className="flex h-full flex-col"
          onSubmit={(event) => {
            event.preventDefault()
            updateSegment.mutate(readSegmentForm(event.currentTarget))
          }}
        >
          <Drawer.Header>
            <Drawer.Title>Edit segment</Drawer.Title>
          </Drawer.Header>
          <Drawer.Body className="flex-1">
            <SegmentFormFields key={segment.updated_at} segment={segment} />
          </Drawer.Body>
          <Drawer.Footer>
            <Drawer.Close asChild>
              <Button
                size="small"
                variant="secondary"
                type="button"
                disabled={updateSegment.isPending}
              >
                Cancel
              </Button>
            </Drawer.Close>
            <Button
              size="small"
              type="submit"
              isLoading={updateSegment.isPending}
            >
              Save
            </Button>
          </Drawer.Footer>
        </form>
      </Drawer.Content>
    </Drawer>
  )
}

const AddCustomersModal = ({
  session,
  segment,
  open,
  onOpenChange,
}: {
  session: MerchantSession
  segment: MerchantCustomerSegmentDetail
  open: boolean
  onOpenChange: (open: boolean) => void
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
    () => new Set(segment.customers.map(({ id }) => id)),
    [segment.customers]
  )
  const invalidate = useSegmentInvalidation(session.merchant.id, segment.id)
  const candidatesQuery = useQuery({
    queryKey: [
      ...merchantQueryKeys.resource(
        session.merchant.id,
        "customer-segment-candidates"
      ),
      limit,
      offset,
      deferredSearch,
    ],
    queryFn: () => {
      const parameters = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
      })

      if (deferredSearch.trim()) {
        parameters.set("q", deferredSearch.trim())
      }

      return merchantApi.get<CustomerListResponse>(
        session.merchant.id,
        `/customers?${parameters.toString()}`
      )
    },
    enabled: open,
    placeholderData: keepPreviousData,
  })
  const addCustomers = useMutation({
    mutationFn: (customerIds: string[]) =>
      merchantApi.post(
        session.merchant.id,
        `/customer-segments/${segment.id}/customers`,
        { add: customerIds }
      ),
    onSuccess: async (_, customerIds) => {
      await invalidate()
      toast.success(
        `Added ${customerIds.length} customer${customerIds.length === 1 ? "" : "s"}`
      )
      setRowSelection({})
      onOpenChange(false)
    },
    onError: (error) => toast.error(errorMessage(error)),
  })
  const columns = useMemo(
    () => [
      candidateColumnHelper.select(),
      candidateColumnHelper.accessor(personName, {
        id: "name",
        header: "Customer",
        cell: ({ row, getValue }) => (
          <div className="flex items-center gap-2">
            <Text size="small" leading="compact" weight="plus">
              {getValue()}
            </Text>
            {row.original.customer_id &&
              memberIds.has(row.original.customer_id) && (
                <StatusBadge color="grey">In segment</StatusBadge>
              )}
          </div>
        ),
      }),
      candidateColumnHelper.accessor("email", {
        header: "Email",
        cell: ({ getValue }) => getValue() || "-",
      }),
      candidateColumnHelper.accessor("order_count", {
        header: "Orders",
      }),
    ],
    [memberIds]
  )
  const table = useDataTable({
    columns,
    data: candidatesQuery.data?.customers ?? [],
    getRowId: (customer) => customer.customer_id ?? customer.id,
    rowCount: candidatesQuery.data?.count ?? 0,
    isLoading: candidatesQuery.isPending,
    rowSelection: {
      state: rowSelection,
      onRowSelectionChange: setRowSelection,
      enableRowSelection: (row) =>
        Boolean(row.original.customer_id) &&
        !memberIds.has(row.original.customer_id as string),
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
          <FocusModal.Header>
            <div className="flex items-center justify-end gap-x-2">
              <FocusModal.Close asChild>
                <Button
                  size="small"
                  variant="secondary"
                  disabled={addCustomers.isPending}
                >
                  Cancel
                </Button>
              </FocusModal.Close>
              <Button
                size="small"
                disabled={!selectedIds.length}
                isLoading={addCustomers.isPending}
                onClick={() => addCustomers.mutate(selectedIds)}
              >
                Add{selectedIds.length ? ` ${selectedIds.length}` : ""}
              </Button>
            </div>
          </FocusModal.Header>
          <FocusModal.Body className="flex flex-1 flex-col overflow-hidden">
            <div className="px-6 py-4">
              <Heading>Add customers to {segment.name}</Heading>
              <Text size="small" className="text-ui-fg-subtle">
                Select customers from your workspace.
              </Text>
            </div>
            <DataTable instance={table}>
              <DataTable.Toolbar>
                <div className="min-w-64 flex-1">
                  <DataTable.Search placeholder="Search customers" />
                </div>
              </DataTable.Toolbar>
              <DataTable.Table
                emptyState={{
                  empty: {
                    heading: "No customers yet",
                    description: "Create a customer or wait for an order.",
                  },
                  filtered: {
                    heading: "No matching customers",
                    description: "Try another search.",
                  },
                }}
              />
              <DataTable.Pagination />
            </DataTable>
          </FocusModal.Body>
        </div>
      </FocusModal.Content>
    </FocusModal>
  )
}

const SegmentMembers = ({
  session,
  segment,
  canEdit,
  onAdd,
}: {
  session: MerchantSession
  segment: MerchantCustomerSegmentDetail
  canEdit: boolean
  onAdd: () => void
}) => {
  const [search, setSearch] = useState("")
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 })
  const invalidate = useSegmentInvalidation(session.merchant.id, segment.id)
  const removeCustomer = useMutation({
    mutationFn: (customerId: string) =>
      merchantApi.post(
        session.merchant.id,
        `/customer-segments/${segment.id}/customers`,
        { remove: [customerId] }
      ),
    onSuccess: async () => {
      await invalidate()
      toast.success("Customer removed from segment")
    },
    onError: (error) => toast.error(errorMessage(error)),
  })
  const { mutate: removeMember, isPending: isRemoving } = removeCustomer
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()

    return term
      ? segment.customers.filter((customer) =>
          [
            customer.email,
            customer.first_name,
            customer.last_name,
            customer.company_name,
            customer.phone,
          ]
            .join(" ")
            .toLowerCase()
            .includes(term)
        )
      : segment.customers
  }, [search, segment.customers])
  const page = filtered.slice(
    pagination.pageIndex * pagination.pageSize,
    (pagination.pageIndex + 1) * pagination.pageSize
  )
  const columns = useMemo(
    () => [
      memberColumnHelper.accessor(personName, {
        id: "name",
        header: "Customer",
        cell: ({ row, getValue }) => (
          <Link
            className="text-ui-fg-interactive font-medium"
            to={`/merchant-customers/${row.original.id}`}
          >
            {getValue()}
          </Link>
        ),
      }),
      memberColumnHelper.accessor("email", {
        header: "Email",
        cell: ({ getValue }) => getValue() || "-",
      }),
      memberColumnHelper.accessor("phone", {
        header: "Phone",
        cell: ({ getValue }) => getValue() || "-",
      }),
      memberColumnHelper.accessor("has_account", {
        header: "Account",
        cell: ({ getValue }) => (
          <StatusBadge color={getValue() ? "green" : "orange"}>
            {getValue() ? "Registered" : "Guest"}
          </StatusBadge>
        ),
      }),
      ...(canEdit
        ? [
            memberColumnHelper.display({
              id: "actions",
              cell: ({ row }) => (
                <div className="flex justify-end">
                  <Button
                    size="small"
                    variant="secondary"
                    disabled={isRemoving}
                    onClick={() => removeMember(row.original.id)}
                  >
                    Remove
                  </Button>
                </div>
              ),
            }),
          ]
        : []),
    ],
    [canEdit, isRemoving, removeMember]
  )
  const table = useDataTable({
    columns,
    data: page,
    getRowId: (customer) => customer.id,
    rowCount: filtered.length,
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
          <Heading level="h2">Customers</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {segment.customer_count} in this segment
          </Text>
        </div>
        {canEdit && (
          <Button size="small" variant="secondary" onClick={onAdd}>
            Add customers
          </Button>
        )}
      </div>
      <DataTable instance={table}>
        <DataTable.Toolbar>
          <div className="min-w-64 flex-1">
            <DataTable.Search placeholder="Search segment customers" />
          </div>
        </DataTable.Toolbar>
        <DataTable.Table
          emptyState={{
            empty: {
              heading: "No customers in this segment",
              description: "Add customers to start using this segment.",
            },
            filtered: {
              heading: "No matching customers",
              description: "Try another search.",
            },
          }}
        />
        <DataTable.Pagination />
      </DataTable>
    </Container>
  )
}

const SegmentDetailsContent = ({ session }: { session: MerchantSession }) => {
  const { id = "" } = useParams()
  const navigate = useNavigate()
  const prompt = usePrompt()
  const queryClient = useQueryClient()
  const [editOpen, setEditOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const canEdit = canManageMerchant(session.member.role)
  const segmentQuery = useQuery({
    queryKey: merchantQueryKeys.resource(
      session.merchant.id,
      `customer-segments/${id}`
    ),
    queryFn: async () => {
      const response = await merchantApi.get<{
        customer_segment: MerchantCustomerSegmentDetail
      }>(session.merchant.id, `/customer-segments/${id}`)

      return response.customer_segment
    },
    enabled: Boolean(id),
  })
  const deleteSegment = useMutation({
    mutationFn: () =>
      merchantApi.delete(session.merchant.id, `/customer-segments/${id}`),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: merchantQueryKeys.resource(
            session.merchant.id,
            "customer-segments"
          ),
        }),
        queryClient.invalidateQueries({
          queryKey: merchantQueryKeys.resource(
            session.merchant.id,
            "customers"
          ),
        }),
      ])
      queryClient.removeQueries({
        queryKey: merchantQueryKeys.resource(
          session.merchant.id,
          `customer-segments/${id}`
        ),
      })
      toast.success("Segment deleted")
      navigate("/merchant-customer-segments")
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  if (segmentQuery.isPending) return <MerchantPageSkeleton />
  if (segmentQuery.isError || !segmentQuery.data) throw segmentQuery.error

  const segment = segmentQuery.data

  return (
    <div className="flex flex-col gap-y-3">
      <Container className="p-0">
        <div className="flex items-start justify-between gap-x-4 px-6 py-4">
          <div className="flex min-w-0 flex-col gap-y-1">
            <Heading>{segment.name}</Heading>
            <Text size="small" className="text-ui-fg-subtle">
              {segment.description || "No description"}
            </Text>
          </div>
          <div className="flex shrink-0 gap-x-2">
            <Button size="small" variant="secondary" asChild>
              <Link to="/merchant-customer-segments">Back</Link>
            </Button>
            {canEdit && (
              <>
                <Button
                  size="small"
                  variant="secondary"
                  onClick={() => setEditOpen(true)}
                >
                  Edit
                </Button>
                <Button
                  size="small"
                  variant="danger"
                  isLoading={deleteSegment.isPending}
                  onClick={async () => {
                    const confirmed = await prompt({
                      title: `Delete ${segment.name}?`,
                      description:
                        "Customers stay in your workspace. Only the segment and its memberships are removed.",
                      confirmText: "Delete",
                      cancelText: "Cancel",
                    })

                    if (confirmed) deleteSegment.mutate()
                  }}
                >
                  Delete
                </Button>
              </>
            )}
          </div>
        </div>
      </Container>
      <SegmentMembers
        session={session}
        segment={segment}
        canEdit={canEdit}
        onAdd={() => setAddOpen(true)}
      />
      {canEdit && (
        <>
          <EditSegmentDrawer
            session={session}
            segment={segment}
            open={editOpen}
            onOpenChange={setEditOpen}
          />
          <AddCustomersModal
            session={session}
            segment={segment}
            open={addOpen}
            onOpenChange={setAddOpen}
          />
        </>
      )}
    </div>
  )
}

const MerchantCustomerSegmentDetailsPage = () => (
  <MerchantRoute>
    {(session) => <SegmentDetailsContent session={session} />}
  </MerchantRoute>
)

export const handle = { breadcrumb: () => "Segment details" }

export default MerchantCustomerSegmentDetailsPage
