import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Container, Heading, Table, Text } from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"

import {
  MerchantPageHeader,
  MerchantRoute,
} from "../../../components/merchant/merchant-page"
import {
  formatMoney,
  merchantApi,
  merchantQueryKeys,
  type MerchantReports,
  type MerchantSession,
} from "../../../lib/merchant-api"

const ReportsContent = ({ session }: { session: MerchantSession }) => {
  const reportsQuery = useQuery({
    queryKey: merchantQueryKeys.resource(session.merchant.id, "reports"),
    queryFn: async () => {
      const response = await merchantApi.get<{ reports: MerchantReports }>(
        session.merchant.id,
        "/reports",
      )
      return response.reports
    },
  })

  if (reportsQuery.isError) throw reportsQuery.error

  const reports = reportsQuery.data
  const metrics = reports?.metrics
  const currency = reports?.currency_code

  return (
    <div className="flex flex-col gap-y-3">
      <Container className="divide-y p-0">
        <MerchantPageHeader
          title="Reports"
          subtitle={`Sales performance for ${session.merchant.name}`}
        />
        <div className="grid gap-px bg-ui-border-base md:grid-cols-3 xl:grid-cols-6">
          {[
            ["Revenue", formatMoney(metrics?.revenue, currency)],
            ["Orders", metrics?.order_count ?? 0],
            [
              "Average order",
              formatMoney(metrics?.average_order_value, currency),
            ],
            ["Active orders", metrics?.active_order_count ?? 0],
            ["Products", metrics?.product_count ?? 0],
            ["Customers", metrics?.customer_count ?? 0],
          ].map(([label, value]) => (
            <div className="bg-ui-bg-base p-5" key={String(label)}>
              <Text size="small" className="text-ui-fg-subtle">
                {label}
              </Text>
              <Heading level="h2" className="mt-1">
                {value}
              </Heading>
            </div>
          ))}
        </div>
      </Container>
      <div className="grid gap-3 xl:grid-cols-2">
        <Container className="divide-y p-0">
          <div className="px-6 py-4">
            <Heading level="h2">Sales by day</Heading>
          </div>
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Date</Table.HeaderCell>
                <Table.HeaderCell>Orders</Table.HeaderCell>
                <Table.HeaderCell>Revenue</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {(reports?.orders_by_day ?? []).map((row) => (
                <Table.Row key={row.date}>
                  <Table.Cell>{row.date}</Table.Cell>
                  <Table.Cell>{row.orders}</Table.Cell>
                  <Table.Cell>{formatMoney(row.revenue, currency)}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </Container>
        <Container className="divide-y p-0">
          <div className="px-6 py-4">
            <Heading level="h2">Product performance</Heading>
          </div>
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Product</Table.HeaderCell>
                <Table.HeaderCell>Units</Table.HeaderCell>
                <Table.HeaderCell>Revenue</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {(reports?.product_performance ?? []).map((row) => (
                <Table.Row key={row.product_id}>
                  <Table.Cell>{row.title}</Table.Cell>
                  <Table.Cell>{row.quantity}</Table.Cell>
                  <Table.Cell>{formatMoney(row.revenue, currency)}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </Container>
      </div>
    </div>
  )
}

const MerchantReportsPage = () => (
  <MerchantRoute>
    {(session) => <ReportsContent session={session} />}
  </MerchantRoute>
)

export const config = defineRouteConfig({})
export const handle = { breadcrumb: () => "Reports" }
export default MerchantReportsPage
