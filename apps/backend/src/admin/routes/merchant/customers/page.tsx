import { defineRouteConfig } from "@medusajs/admin-sdk"
import {
  Button,
  Checkbox,
  Container,
  DataTable,
  FocusModal,
  Heading,
  Input,
  Label,
  Select,
  StatusBadge,
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
  statusColor,
} from "../../../components/merchant/merchant-page"
import {
  canManageMerchant,
  downloadCsv,
  errorMessage,
  formatDate,
  merchantApi,
  merchantQueryKeys,
  type MerchantCustomer,
  type MerchantCustomerListItem,
  type MerchantCustomerSegment,
  type MerchantCustomerSegmentListResponse,
  type MerchantSession,
} from "../../../lib/merchant-api"

const columnHelper = createDataTableColumnHelper<MerchantCustomerListItem>()

function customerName(customer: MerchantCustomerListItem) {
  return (
    [customer.first_name, customer.last_name].filter(Boolean).join(" ") ||
    customer.email ||
    "Guest customer"
  )
}

function accountLabel(customer: MerchantCustomerListItem) {
  return customer.has_account ? "Registered" : "Guest"
}

type CustomerListResponse = {
  customers: MerchantCustomerListItem[]
  count: number
  limit: number
  offset: number
}

function customerListSuffix(input: {
  search: string
  accountType: string
  segmentId: string
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
  if (input.accountType !== "all") {
    parameters.set("account_type", input.accountType)
  }
  if (input.segmentId !== "all") {
    parameters.set("segment_id", input.segmentId)
  }

  return `/customers?${parameters.toString()}`
}

const optionalValue = (form: FormData, name: string) =>
  String(form.get(name) ?? "").trim() || null

const readCreateCustomerForm = (
  formElement: HTMLFormElement,
  segmentIds: string[]
) => {
  const form = new FormData(formElement)

  return {
    customer: {
      email: String(form.get("email") ?? "").trim(),
      first_name: optionalValue(form, "first_name"),
      last_name: optionalValue(form, "last_name"),
      company_name: optionalValue(form, "company_name"),
      phone: optionalValue(form, "phone"),
    },
    segment_ids: segmentIds,
  }
}

const CreateCustomerModal = ({
  session,
  segments,
  open,
  onOpenChange,
}: {
  session: MerchantSession
  segments: MerchantCustomerSegment[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) => {
  const [segmentIds, setSegmentIds] = useState<string[]>([])
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const createCustomer = useMutation({
    mutationFn: (input: ReturnType<typeof readCreateCustomerForm>) =>
      merchantApi.post<{ customer: MerchantCustomer }>(
        session.merchant.id,
        "/customers",
        input
      ),
    onSuccess: async ({ customer }) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: merchantQueryKeys.resource(
            session.merchant.id,
            "customers"
          ),
        }),
        queryClient.invalidateQueries({
          queryKey: merchantQueryKeys.resource(
            session.merchant.id,
            "customer-segments"
          ),
        }),
        queryClient.invalidateQueries({
          queryKey: merchantQueryKeys.dashboard(session.merchant.id),
        }),
      ])
      toast.success("Customer created")
      setSegmentIds([])
      onOpenChange(false)
      navigate(`/merchant-customers/${customer.id}`)
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  return (
    <FocusModal
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) setSegmentIds([])
      }}
    >
      <FocusModal.Content>
        <form
          className="flex h-full flex-col overflow-hidden"
          onSubmit={(event) => {
            event.preventDefault()
            createCustomer.mutate(
              readCreateCustomerForm(event.currentTarget, segmentIds)
            )
          }}
        >
          <FocusModal.Header>
            <div className="flex items-center justify-end gap-x-2">
              <FocusModal.Close asChild>
                <Button
                  size="small"
                  variant="secondary"
                  type="button"
                  disabled={createCustomer.isPending}
                >
                  Cancel
                </Button>
              </FocusModal.Close>
              <Button
                size="small"
                type="submit"
                isLoading={createCustomer.isPending}
              >
                Create
              </Button>
            </div>
          </FocusModal.Header>
          <FocusModal.Body className="flex flex-1 justify-center overflow-y-auto px-6 py-16">
            <div className="flex w-full max-w-lg flex-col gap-y-8">
              <div className="flex flex-col gap-y-1">
                <Heading>Create customer</Heading>
                <Text size="small" className="text-ui-fg-subtle">
                  Add a customer to {session.merchant.name}. Details you enter
                  here are private to your workspace.
                </Text>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 flex flex-col gap-y-2">
                  <Label htmlFor="customer-email" weight="plus">
                    Email
                  </Label>
                  <Input
                    id="customer-email"
                    name="email"
                    type="email"
                    required
                  />
                </div>
                {[
                  { name: "first_name", label: "First name" },
                  { name: "last_name", label: "Last name" },
                  { name: "phone", label: "Phone" },
                  { name: "company_name", label: "Company" },
                ].map(({ name, label }) => (
                  <div className="flex flex-col gap-y-2" key={name}>
                    <Label htmlFor={`customer-${name}`} weight="plus">
                      {label}
                    </Label>
                    <Input id={`customer-${name}`} name={name} />
                  </div>
                ))}
              </div>
              {segments.length > 0 && (
                <div className="flex flex-col gap-y-3">
                  <Label weight="plus">Segments</Label>
                  <div className="flex flex-col gap-y-2">
                    {segments.map((segment) => (
                      <div
                        className="flex items-center gap-x-2"
                        key={segment.id}
                      >
                        <Checkbox
                          id={`create-segment-${segment.id}`}
                          checked={segmentIds.includes(segment.id)}
                          onCheckedChange={(checked) =>
                            setSegmentIds((current) =>
                              checked === true
                                ? [...current, segment.id]
                                : current.filter((id) => id !== segment.id)
                            )
                          }
                        />
                        <Label
                          htmlFor={`create-segment-${segment.id}`}
                          size="small"
                        >
                          {segment.name}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </FocusModal.Body>
        </form>
      </FocusModal.Content>
    </FocusModal>
  )
}

const MerchantCustomersContent = ({
  session,
}: {
  session: MerchantSession
}) => {
  const [search, setSearch] = useState("")
  const [accountType, setAccountType] = useState("all")
  const [segmentId, setSegmentId] = useState("all")
  const [createOpen, setCreateOpen] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const canEdit = canManageMerchant(session.member.role)
  const segmentsQuery = useQuery({
    queryKey: [
      ...merchantQueryKeys.resource(session.merchant.id, "customer-segments"),
      "options",
    ],
    queryFn: () =>
      merchantApi.get<MerchantCustomerSegmentListResponse>(
        session.merchant.id,
        "/customer-segments?limit=100"
      ),
  })
  const segments = segmentsQuery.data?.customer_segments ?? []
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 20,
  })
  const deferredSearch = useDeferredValue(search)
  const limit = pagination.pageSize
  const offset = pagination.pageIndex * limit
  const customersQuery = useQuery({
    queryKey: [
      ...merchantQueryKeys.resource(session.merchant.id, "customers"),
      limit,
      offset,
      deferredSearch,
      accountType,
      segmentId,
    ],
    queryFn: async () => {
      return merchantApi.get<CustomerListResponse>(
        session.merchant.id,
        customerListSuffix({
          search: deferredSearch,
          accountType,
          segmentId,
          limit,
          offset,
        })
      )
    },
    placeholderData: keepPreviousData,
  })
  const columns = useMemo(
    () => [
      columnHelper.accessor(customerName, {
        id: "name",
        header: "Customer",
        cell: ({ row, getValue }) =>
          row.original.customer_id ? (
            <Link
              className="text-ui-fg-interactive font-medium"
              to={`/merchant-customers/${row.original.customer_id}`}
            >
              {getValue()}
            </Link>
          ) : (
            <Text size="small" weight="plus">
              {getValue()}
            </Text>
          ),
      }),
      columnHelper.accessor("email", {
        header: "Email",
        cell: ({ getValue }) => getValue() || "—",
      }),
      columnHelper.accessor(accountLabel, {
        id: "account",
        header: "Account",
        cell: ({ row, getValue }) => (
          <StatusBadge color={row.original.has_account ? "green" : "orange"}>
            {getValue()}
          </StatusBadge>
        ),
      }),
      columnHelper.accessor("order_count", {
        header: "Orders",
      }),
      columnHelper.accessor("last_order_at", {
        header: "Last order",
        cell: ({ getValue }) => formatDate(getValue() ?? undefined),
      }),
      columnHelper.accessor("status", {
        header: "Access",
        cell: ({ getValue }) => (
          <StatusBadge color={statusColor(getValue())}>
            {getValue()}
          </StatusBadge>
        ),
      }),
    ],
    []
  )
  const table = useDataTable({
    columns,
    data: customersQuery.data?.customers ?? [],
    getRowId: (customer) => customer.id,
    rowCount: customersQuery.data?.count ?? 0,
    isLoading: customersQuery.isPending,
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

  if (customersQuery.isError) {
    throw customersQuery.error
  }

  return (
    <Container className="divide-y p-0">
      <MerchantPageHeader
        title="Customers"
        subtitle={`Customers who have shopped with or have a profile at ${session.merchant.name}`}
        actions={
          <>
            {canEdit && (
              <Button
                size="small"
                variant="secondary"
                onClick={() => setCreateOpen(true)}
              >
                Create customer
              </Button>
            )}
            <Button
              size="small"
              variant="secondary"
              isLoading={isExporting}
              onClick={async () => {
                setIsExporting(true)
                try {
                  const exportedCustomers: MerchantCustomerListItem[] = []
                  const exportLimit = 100
                  let exportOffset = 0
                  let total = 0

                  do {
                    const page = await merchantApi.get<CustomerListResponse>(
                      session.merchant.id,
                      customerListSuffix({
                        search: deferredSearch,
                        accountType,
                        segmentId,
                        limit: exportLimit,
                        offset: exportOffset,
                      })
                    )
                    exportedCustomers.push(...page.customers)
                    total = page.count
                    exportOffset = page.customers.length
                      ? exportOffset + page.customers.length
                      : total
                  } while (exportOffset < total)

                  const exported = downloadCsv(
                    "merchant-customers.csv",
                    exportedCustomers.map((customer) => ({
                      id: customer.customer_id ?? customer.id,
                      status: customer.status,
                      account_type: accountLabel(customer),
                      email: customer.email,
                      first_name: customer.first_name,
                      last_name: customer.last_name,
                      phone: customer.phone,
                      order_count: customer.order_count,
                      first_order_at: customer.first_order_at,
                      last_order_at: customer.last_order_at,
                      created_at: customer.created_at,
                    }))
                  )
                  if (!exported) toast.info("There are no customers to export")
                } catch (error) {
                  toast.error(errorMessage(error))
                } finally {
                  setIsExporting(false)
                }
              }}
            >
              Export CSV
            </Button>
          </>
        }
      />
      <DataTable instance={table}>
        <DataTable.Toolbar>
          <div className="flex w-full flex-wrap items-center gap-2">
            <div className="min-w-64 flex-1">
              <DataTable.Search placeholder="Search customers" />
            </div>
            <Select
              value={accountType}
              onValueChange={(value) => {
                setAccountType(value)
                setPagination((current) => ({ ...current, pageIndex: 0 }))
              }}
            >
              <Select.Trigger className="w-44">
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="all">All customers</Select.Item>
                <Select.Item value="registered">Registered</Select.Item>
                <Select.Item value="guest">Guest</Select.Item>
              </Select.Content>
            </Select>
            {segments.length > 0 && (
              <Select
                value={segmentId}
                onValueChange={(value) => {
                  setSegmentId(value)
                  setPagination((current) => ({ ...current, pageIndex: 0 }))
                }}
              >
                <Select.Trigger className="w-52">
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value="all">All segments</Select.Item>
                  {segments.map((segment) => (
                    <Select.Item key={segment.id} value={segment.id}>
                      {segment.name}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select>
            )}
          </div>
        </DataTable.Toolbar>
        <DataTable.Table
          emptyState={{
            empty: {
              heading: "No customers yet",
              description:
                "Customers will appear after an order is placed or a merchant profile is created.",
            },
            filtered: {
              heading: "No matching customers",
              description: "Try another search, account, or segment filter.",
            },
          }}
        />
        <DataTable.Pagination />
      </DataTable>
      {canEdit && (
        <CreateCustomerModal
          session={session}
          segments={segments}
          open={createOpen}
          onOpenChange={setCreateOpen}
        />
      )}
    </Container>
  )
}

const MerchantCustomersPage = () => {
  return (
    <MerchantRoute>
      {(session) => <MerchantCustomersContent session={session} />}
    </MerchantRoute>
  )
}

export const config = defineRouteConfig({})

export const handle = {
  breadcrumb: () => "Customers",
}

export default MerchantCustomersPage
