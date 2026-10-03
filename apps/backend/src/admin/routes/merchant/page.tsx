import { defineRouteConfig } from "@medusajs/admin-sdk"
import {
  ArrowRight,
  Buildings,
  ChartBar,
  CheckMini,
  House,
  ShoppingCart,
  Tag,
  Users,
} from "@medusajs/icons"
import {
  Badge,
  Button,
  Container,
  Heading,
  Select,
  StatusBadge,
  Table,
  Text,
} from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { Link } from "react-router-dom"

import {
  MerchantEmptyState,
  MerchantPageHeader,
  MerchantPageSkeleton,
  MerchantRoute,
  statusColor,
} from "../../components/merchant/merchant-page"
import {
  formatDate,
  formatMoney,
  merchantApi,
  merchantQueryKeys,
  type MerchantHome,
  type MerchantHomeRange,
  type MerchantSession,
} from "../../lib/merchant-api"

const rangeOptions: Array<{ value: MerchantHomeRange; label: string }> = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
]

const comparisonLabel = (value: number | null) => {
  if (value === null) {
    return "New"
  }

  const rounded = Math.round(value)
  return `${rounded > 0 ? "+" : ""}${rounded}%`
}

const shortDate = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(new Date(`${value}T00:00:00+03:00`))

const OnboardingCard = ({ home }: { home: MerchantHome }) => {
  const incompleteSteps = home.onboarding.steps.filter(
    ({ complete }) => !complete,
  )
  const progress = Math.round(
    (home.onboarding.completed / home.onboarding.total) * 100,
  )

  return (
    <Container className="merchant-onboarding-card divide-y p-0">
      <div className="flex flex-wrap items-start justify-between gap-3 px-6 py-4">
        <div className="flex flex-col gap-y-1">
          <div className="flex items-center gap-x-2">
            <Text size="small" leading="compact" weight="plus">
              Finish setting up your store
            </Text>
            <Badge color="green">
              {home.onboarding.completed}/{home.onboarding.total}
            </Badge>
          </div>
          <Text size="small" leading="compact" className="text-ui-fg-subtle">
            Complete these steps before sending customers to your storefront.
          </Text>
        </div>
        <Text size="small" leading="compact" weight="plus">
          {progress}% complete
        </Text>
      </div>
      <div className="merchant-progress-track">
        <div
          className="merchant-progress-value"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="grid gap-px bg-ui-border-base sm:grid-cols-2">
        {incompleteSteps.map((step) => (
          <Link
            className="group flex items-center justify-between gap-x-3 bg-ui-bg-base px-6 py-4 hover:bg-ui-bg-base-hover"
            key={step.id}
            to={step.to}
          >
            <div className="flex flex-col gap-y-1">
              <Text size="small" leading="compact" weight="plus">
                {step.label}
              </Text>
              <Text
                size="small"
                leading="compact"
                className="text-ui-fg-subtle"
              >
                {step.description}
              </Text>
            </div>
            <ArrowRight className="text-ui-fg-muted transition-transform group-hover:translate-x-0.5" />
          </Link>
        ))}
      </div>
    </Container>
  )
}

const MetricCards = ({ home }: { home: MerchantHome }) => {
  const metrics = [
    {
      key: "sales" as const,
      label: "Total sales",
      value: formatMoney(home.summary.sales, home.currency_code),
      icon: ChartBar,
    },
    {
      key: "orders" as const,
      label: "Orders",
      value: home.summary.orders.toLocaleString(),
      icon: ShoppingCart,
    },
    {
      key: "average_order_value" as const,
      label: "Average order",
      value: formatMoney(home.summary.average_order_value, home.currency_code),
      icon: Tag,
    },
    {
      key: "customers" as const,
      label: "Customers",
      value: home.summary.customers.toLocaleString(),
      icon: Users,
    },
  ]

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map(({ key, label, value, icon: Icon }) => {
        const comparison = home.comparison[key]

        return (
          <Container className="merchant-kpi-card p-5" key={key}>
            <div className="flex items-start justify-between gap-x-3">
              <div className="flex flex-col gap-y-2">
                <Text
                  size="small"
                  leading="compact"
                  className="text-ui-fg-subtle"
                >
                  {label}
                </Text>
                <Heading level="h2">{value}</Heading>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge
                    color={
                      comparison === null || comparison === 0
                        ? "grey"
                        : comparison > 0
                          ? "green"
                          : "red"
                    }
                  >
                    {comparisonLabel(comparison)}
                  </StatusBadge>
                  <Text
                    size="xsmall"
                    leading="compact"
                    className="text-ui-fg-muted"
                  >
                    {home.period.comparison_label}
                  </Text>
                </div>
              </div>
              <div className="merchant-kpi-icon flex size-10 shrink-0 items-center justify-center rounded-full">
                <Icon />
              </div>
            </div>
          </Container>
        )
      })}
    </div>
  )
}

const SalesChart = ({ home }: { home: MerchantHome }) => {
  const maximum = Math.max(
    ...home.sales_by_day.map(({ revenue }) => revenue),
    1,
  )
  const hasSales = home.sales_by_day.some(({ revenue }) => revenue > 0)

  return (
    <Container className="divide-y p-0 xl:col-span-2">
      <div className="flex items-center justify-between gap-x-3 px-6 py-4">
        <div className="flex flex-col gap-y-1">
          <Heading level="h2">Sales performance</Heading>
          <Text size="small" leading="compact" className="text-ui-fg-subtle">
            {home.period.label} in {home.currency_code.toUpperCase()}
          </Text>
        </div>
        <Text size="small" leading="compact" weight="plus">
          {formatMoney(home.summary.sales, home.currency_code)}
        </Text>
      </div>
      {hasSales ? (
        <div
          className="merchant-sales-chart px-6 pb-4 pt-8"
          role="img"
          aria-label={`Daily sales for ${home.period.label}`}
        >
          {home.sales_by_day.map((day, index) => {
            const showLabel =
              home.sales_by_day.length <= 7 ||
              index === 0 ||
              index === home.sales_by_day.length - 1 ||
              index % 5 === 0

            return (
              <div
                className="flex min-w-0 flex-1 flex-col items-center gap-y-2"
                key={day.date}
              >
                <div className="flex h-44 w-full items-end justify-center">
                  <div
                    className="merchant-sales-bar w-full max-w-8 rounded-t-md"
                    style={{
                      height: `${Math.max((day.revenue / maximum) * 100, 3)}%`,
                    }}
                    title={`${shortDate(day.date)}: ${formatMoney(day.revenue, home.currency_code)}`}
                  />
                </div>
                <Text
                  size="xsmall"
                  leading="compact"
                  className="truncate text-ui-fg-muted"
                >
                  {showLabel ? shortDate(day.date) : ""}
                </Text>
              </div>
            )
          })}
        </div>
      ) : (
        <MerchantEmptyState
          title="No sales in this period"
          description="Sales will appear here as customers complete their orders."
        />
      )}
    </Container>
  )
}

const AttentionCard = ({ home }: { home: MerchantHome }) => {
  const openTasks = home.attention.filter(({ count }) => count > 0)

  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h2">Needs attention</Heading>
        <Text size="small" leading="compact" className="text-ui-fg-subtle">
          Operational work waiting for your team
        </Text>
      </div>
      {openTasks.length ? (
        <div className="divide-y">
          {openTasks.map((task) => (
            <Link
              className="group flex items-center justify-between gap-x-3 px-6 py-4 hover:bg-ui-bg-base-hover"
              key={task.id}
              to={task.to}
            >
              <div className="flex min-w-0 flex-col gap-y-1">
                <Text size="small" leading="compact" weight="plus">
                  {task.label}
                </Text>
                <Text
                  size="small"
                  leading="compact"
                  className="text-ui-fg-subtle"
                >
                  {task.description}
                </Text>
              </div>
              <div className="flex shrink-0 items-center gap-x-2">
                <StatusBadge color="orange">{task.count}</StatusBadge>
                <ArrowRight className="text-ui-fg-muted transition-transform group-hover:translate-x-0.5" />
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-x-3 px-6 py-6">
          <div className="merchant-success-icon flex size-9 items-center justify-center rounded-full">
            <CheckMini />
          </div>
          <div className="flex flex-col gap-y-1">
            <Text size="small" leading="compact" weight="plus">
              You are all caught up
            </Text>
            <Text size="small" leading="compact" className="text-ui-fg-subtle">
              There are no urgent store tasks right now.
            </Text>
          </div>
        </div>
      )}
    </Container>
  )
}

const RecentOrders = ({ home }: { home: MerchantHome }) => (
  <Container className="divide-y p-0 xl:col-span-2">
    <div className="flex items-center justify-between gap-x-3 px-6 py-4">
      <div className="flex flex-col gap-y-1">
        <Heading level="h2">Recent orders</Heading>
        <Text size="small" leading="compact" className="text-ui-fg-subtle">
          The latest orders placed with this store
        </Text>
      </div>
      <Button size="small" variant="transparent" asChild>
        <Link to="/merchant-orders">View all</Link>
      </Button>
    </div>
    {home.recent_orders.length ? (
      <Table>
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>Order</Table.HeaderCell>
            <Table.HeaderCell>Customer</Table.HeaderCell>
            <Table.HeaderCell>Status</Table.HeaderCell>
            <Table.HeaderCell>Total</Table.HeaderCell>
            <Table.HeaderCell>Created</Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {home.recent_orders.map((order) => (
            <Table.Row key={order.id}>
              <Table.Cell>
                <Link
                  className="text-ui-fg-interactive font-medium"
                  to={`/merchant-orders/${order.id}`}
                >
                  #{order.display_id}
                </Link>
              </Table.Cell>
              <Table.Cell>{order.email || "Guest customer"}</Table.Cell>
              <Table.Cell>
                <StatusBadge color={statusColor(order.status)}>
                  {order.status}
                </StatusBadge>
              </Table.Cell>
              <Table.Cell>
                {formatMoney(order.total, order.currency_code)}
              </Table.Cell>
              <Table.Cell>
                {formatDate(order.created_at ?? undefined)}
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table>
    ) : (
      <MerchantEmptyState
        title="No orders yet"
        description="Orders for this storefront will appear here."
      />
    )}
  </Container>
)

const StoreHealth = ({ home }: { home: MerchantHome }) => (
  <Container className="divide-y p-0">
    <div className="flex items-start justify-between gap-x-3 px-6 py-4">
      <div className="flex flex-col gap-y-1">
        <Heading level="h2">Store status</Heading>
        <Text size="small" leading="compact" className="text-ui-fg-subtle">
          Payments and storefront readiness
        </Text>
      </div>
      <StatusBadge
        color={home.store_health.status === "live" ? "green" : "orange"}
      >
        {home.store_health.status === "live" ? "Live" : "Needs setup"}
      </StatusBadge>
    </div>
    <div className="divide-y">
      {home.store_health.checks.map((check) => (
        <Link
          className="group flex items-center gap-x-3 px-6 py-3 hover:bg-ui-bg-base-hover"
          key={check.id}
          to={check.to}
        >
          <div
            className={
              check.complete
                ? "merchant-success-icon flex size-8 shrink-0 items-center justify-center rounded-full"
                : "flex size-8 shrink-0 items-center justify-center rounded-full bg-ui-bg-subtle text-ui-fg-muted"
            }
          >
            {check.complete ? <CheckMini /> : <Buildings />}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-y-1">
            <Text size="small" leading="compact" weight="plus">
              {check.label}
            </Text>
            <Text
              size="small"
              leading="compact"
              className="truncate text-ui-fg-subtle"
            >
              {check.description}
            </Text>
          </div>
          <ArrowRight className="text-ui-fg-muted transition-transform group-hover:translate-x-0.5" />
        </Link>
      ))}
    </div>
    {home.store_health.storefront_url && (
      <div className="px-6 py-4">
        <Button size="small" className="w-full" asChild>
          <a
            href={home.store_health.storefront_url}
            target="_blank"
            rel="noreferrer"
          >
            View storefront
          </a>
        </Button>
      </div>
    )}
  </Container>
)

const TopProducts = ({ home }: { home: MerchantHome }) => (
  <Container className="divide-y p-0">
    <div className="flex items-center justify-between gap-x-3 px-6 py-4">
      <div className="flex flex-col gap-y-1">
        <Heading level="h2">Top products</Heading>
        <Text size="small" leading="compact" className="text-ui-fg-subtle">
          Best-selling products for {home.period.label.toLowerCase()}
        </Text>
      </div>
      <Button size="small" variant="transparent" asChild>
        <Link to="/merchant/reports">View reports</Link>
      </Button>
    </div>
    {home.top_products.length ? (
      <Table>
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>Product</Table.HeaderCell>
            <Table.HeaderCell>Units</Table.HeaderCell>
            <Table.HeaderCell>Sales</Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {home.top_products.map((product) => (
            <Table.Row key={product.product_id ?? product.title}>
              <Table.Cell>
                {product.product_id ? (
                  <Link
                    className="text-ui-fg-interactive font-medium"
                    to={`/merchant-products/${product.product_id}`}
                  >
                    {product.title}
                  </Link>
                ) : (
                  product.title
                )}
              </Table.Cell>
              <Table.Cell>{product.quantity}</Table.Cell>
              <Table.Cell>
                {formatMoney(product.revenue, home.currency_code)}
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table>
    ) : (
      <MerchantEmptyState
        title="No product sales yet"
        description="Product performance appears after customers place orders."
      />
    )}
  </Container>
)

const MerchantHomeContent = ({ session }: { session: MerchantSession }) => {
  const [range, setRange] = useState<MerchantHomeRange>("7d")
  const homeQuery = useQuery({
    queryKey: merchantQueryKeys.home(session.merchant.id, range),
    queryFn: () => merchantApi.home(session.merchant.id, range),
  })

  if (homeQuery.isPending) {
    return <MerchantPageSkeleton />
  }

  if (homeQuery.isError || !homeQuery.data) {
    throw homeQuery.error
  }

  const home = homeQuery.data

  return (
    <div className="flex flex-col gap-y-3">
      <Container className="p-0">
        <MerchantPageHeader
          title="Welcome back"
          subtitle={`${home.period.label} business performance for ${home.merchant.name}`}
          role={session.member.role}
          actions={
            <div className="flex items-center gap-x-2">
              <Select
                value={range}
                onValueChange={(value) => setRange(value as MerchantHomeRange)}
              >
                <Select.Trigger className="w-36">
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  {rangeOptions.map((option) => (
                    <Select.Item key={option.value} value={option.value}>
                      {option.label}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select>
              <Button size="small" variant="secondary" asChild>
                <Link to="/merchant-products">Manage products</Link>
              </Button>
            </div>
          }
        />
      </Container>

      {home.onboarding.visible && <OnboardingCard home={home} />}

      {home.has_mixed_currencies && (
        <Container className="flex items-center gap-x-3 px-6 py-4">
          <StatusBadge color="orange">Currency notice</StatusBadge>
          <Text size="small" leading="compact" className="text-ui-fg-subtle">
            Summary metrics show {home.currency_code.toUpperCase()} only.
            Individual orders retain their original currency.
          </Text>
        </Container>
      )}

      <MetricCards home={home} />

      <div className="grid gap-3 xl:grid-cols-3">
        <SalesChart home={home} />
        <AttentionCard home={home} />
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        <RecentOrders home={home} />
        <StoreHealth home={home} />
      </div>

      <TopProducts home={home} />
    </div>
  )
}

const MerchantHomePage = () => (
  <MerchantRoute>
    {(session) => <MerchantHomeContent session={session} />}
  </MerchantRoute>
)

export const config = defineRouteConfig({
  label: "Home",
  icon: House,
  rank: 1,
})

export const handle = {
  breadcrumb: () => "Home",
}

export default MerchantHomePage
