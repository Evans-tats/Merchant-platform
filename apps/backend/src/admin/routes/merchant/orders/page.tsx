import { defineRouteConfig } from "@medusajs/admin-sdk"
import {
  Button,
  Container,
  DataTable,
  Select,
  StatusBadge,
  Text,
  createDataTableColumnHelper,
  toast,
  useDataTable,
  usePrompt,
} from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import { Link } from "react-router-dom"

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
  formatMoney,
  merchantApi,
  merchantQueryKeys,
  type MerchantOrder,
  type MerchantSession,
} from "../../../lib/merchant-api"
import {
  canCancelMerchantOrder,
  formatOrderWorkflowStatus,
  merchantOrderWorkflowStatus,
} from "./order-list-utils"

const columnHelper = createDataTableColumnHelper<MerchantOrder>()

const MerchantOrdersContent = ({ session }: { session: MerchantSession }) => {
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState("all")
  const prompt = usePrompt()
  const queryClient = useQueryClient()
  const ordersQuery = useQuery({
    queryKey: merchantQueryKeys.resource(session.merchant.id, "orders"),
    queryFn: async () => {
      const response = await merchantApi.get<{ orders: MerchantOrder[] }>(
        session.merchant.id,
        "/orders"
      )

      return response.orders
    },
  })
  const cancelOrder = useMutation({
    mutationFn: (orderId: string) =>
      merchantApi.post(
        session.merchant.id,
        `/orders/${orderId}/cancel`,
        {}
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: merchantQueryKeys.resource(
          session.merchant.id,
          "orders"
        ),
      })
      await queryClient.invalidateQueries({
        queryKey: merchantQueryKeys.dashboard(session.merchant.id),
      })
      toast.success("Order cancelled")
    },
    onError: (error) => toast.error(errorMessage(error)),
  })
  const orders = useMemo(() => {
    const query = search.trim().toLowerCase()
    const values = ordersQuery.data ?? []

    return values.filter((order) => {
      const workflowStatus = merchantOrderWorkflowStatus(order)
      const matchesStatus = status === "all" || workflowStatus === status
      const matchesSearch =
        !query ||
        [
          order.display_id,
          order.email,
          order.status,
          order.fulfillment_status,
          workflowStatus,
        ]
          .join(" ")
          .toLowerCase()
          .includes(query)

      return matchesStatus && matchesSearch
    })
  }, [ordersQuery.data, search, status])
  const statusOptions = useMemo(
    () =>
      Array.from(
        new Set((ordersQuery.data ?? []).map(merchantOrderWorkflowStatus))
      ).sort(),
    [ordersQuery.data]
  )
  const columns = useMemo(
    () => [
      columnHelper.accessor("display_id", {
        header: "Order",
        cell: ({ row, getValue }) => (
          <Link
            className="text-ui-fg-interactive font-medium"
                to={`/merchant-orders/${row.original.id}`}
          >
            #{getValue()}
          </Link>
        ),
      }),
      columnHelper.accessor("email", {
        header: "Customer",
        cell: ({ getValue }) => getValue() || "—",
      }),
      columnHelper.accessor(merchantOrderWorkflowStatus, {
        id: "workflow_status",
        header: "Status",
        cell: ({ getValue }) => (
          <StatusBadge color={statusColor(getValue())}>
            {formatOrderWorkflowStatus(getValue())}
          </StatusBadge>
        ),
      }),
      columnHelper.accessor("total", {
        header: "Total",
        cell: ({ row, getValue }) =>
          formatMoney(getValue(), row.original.currency_code),
      }),
      columnHelper.accessor("created_at", {
        header: "Created",
        cell: ({ getValue }) => formatDate(getValue()),
      }),
      columnHelper.display({
        id: "actions",
        header: "",
        cell: ({ row }) => {
          if (
            !canManageMerchant(session.member.role) ||
            !canCancelMerchantOrder(row.original)
          ) {
            return null
          }

          return (
            <Button
              size="small"
              variant="danger"
              isLoading={
                cancelOrder.isPending &&
                cancelOrder.variables === row.original.id
              }
              onClick={async () => {
                const confirmed = await prompt({
                  title: `Cancel order #${row.original.display_id}?`,
                  description:
                    "This will cancel the order and cannot be undone from this workspace.",
                  confirmText: "Cancel order",
                  variant: "danger",
                })

                if (confirmed) {
                  cancelOrder.mutate(row.original.id)
                }
              }}
            >
              Cancel
            </Button>
          )
        },
      }),
    ],
    [cancelOrder, prompt, session.member.role]
  )
  const table = useDataTable({
    columns,
    data: orders,
    getRowId: (order) => order.id,
    rowCount: orders.length,
    isLoading: ordersQuery.isPending,
    search: {
      state: search,
      onSearchChange: setSearch,
    },
  })

  if (ordersQuery.isError) {
    throw ordersQuery.error
  }

  return (
    <Container className="divide-y p-0">
      <MerchantPageHeader
        title="Orders"
        subtitle={`Orders placed with ${session.merchant.name}`}
        actions={<Button size="small" variant="secondary" onClick={() => {
          const exported = downloadCsv("merchant-orders.csv", (ordersQuery.data ?? []).map((order) => ({
            id: order.id,
            display_id: order.display_id,
            workflow_status: merchantOrderWorkflowStatus(order),
            order_status: order.status,
            fulfillment_status: order.fulfillment_status,
            email: order.email,
            total: order.total,
            currency_code: order.currency_code,
            created_at: order.created_at,
          })))
          if (!exported) toast.info("There are no orders to export")
        }}>Export CSV</Button>}
      />
      <DataTable instance={table}>
        <DataTable.Toolbar>
          <div className="flex w-full flex-wrap items-center gap-2">
            <div className="min-w-64 flex-1">
              <DataTable.Search placeholder="Search orders" />
            </div>
            <Select value={status} onValueChange={setStatus}>
              <Select.Trigger className="w-44">
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="all">All statuses</Select.Item>
                {statusOptions.map((option) => (
                  <Select.Item key={option} value={option}>
                    {formatOrderWorkflowStatus(option)}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          </div>
        </DataTable.Toolbar>
        <DataTable.Table
          emptyState={{
            empty: {
              heading: "No orders found",
              description: "Orders for this merchant will appear here.",
            },
            filtered: {
              heading: "No matching orders",
              description: "Try another search.",
            },
          }}
        />
      </DataTable>
      {session.member.role === "staff" && (
        <div className="px-6 py-4">
          <Text size="small" className="text-ui-fg-subtle">
            Staff can review and fulfill orders. Cancelling and refunding
            require an owner or administrator.
          </Text>
        </div>
      )}
    </Container>
  )
}

const MerchantOrdersPage = () => {
  return (
    <MerchantRoute>
      {(session) => <MerchantOrdersContent session={session} />}
    </MerchantRoute>
  )
}

export const config = defineRouteConfig({})

export const handle = {
  breadcrumb: () => "Orders",
}

export default MerchantOrdersPage
