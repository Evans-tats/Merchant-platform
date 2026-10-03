import { BuildingStorefront } from "@medusajs/icons"
import {
  Alert,
  Badge,
  Container,
  Heading,
  Skeleton,
  Text,
} from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import { ReactNode, createContext, useContext } from "react"

import {
  MerchantSession,
  merchantApi,
  merchantQueryKeys,
} from "../../lib/merchant-api"
import "./merchant-workspace.css"

type MerchantRouteProps = {
  children: (session: MerchantSession) => ReactNode
}

const MerchantSessionContext = createContext<MerchantSession | null>(null)

export const MerchantRoute = ({ children }: MerchantRouteProps) => {
  const sessionQuery = useQuery({
    queryKey: merchantQueryKeys.session,
    queryFn: merchantApi.session,
    retry: false,
  })

  if (sessionQuery.isPending) {
    return <MerchantPageSkeleton />
  }

  if (sessionQuery.isError || !sessionQuery.data) {
    return (
      <Container className="p-6">
        <Alert variant="error">
          This account does not have an active merchant membership. Sign out
          and use an invited merchant account.
        </Alert>
      </Container>
    )
  }

  return (
    <MerchantSessionContext.Provider value={sessionQuery.data}>
      {children(sessionQuery.data)}
    </MerchantSessionContext.Provider>
  )
}

export const MerchantPageHeader = ({
  title,
  subtitle,
  role,
  actions,
}: {
  title: string
  subtitle: string
  role?: string
  actions?: ReactNode
}) => {
  const session = useContext(MerchantSessionContext)

  return (
    <div className="merchant-page-header flex items-start justify-between gap-x-4 px-6 py-4">
      <div className="flex min-w-0 flex-col gap-y-1">
        <div className="flex items-center gap-x-2">
          <div className="merchant-brand-mark flex size-5 items-center justify-center rounded-md">
            <BuildingStorefront className="size-3.5" />
          </div>
          <Text
            size="xsmall"
            leading="compact"
            weight="plus"
            className="text-ui-fg-interactive tracking-widest"
          >
            {session?.merchant.name ?? "M-Pesa Merchant"}
          </Text>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Heading className="text-ui-fg-base">{title}</Heading>
          {role && <Badge color="green">{role}</Badge>}
        </div>
        <Text size="small" className="text-ui-fg-subtle">
          {subtitle}
        </Text>
      </div>
      {actions && <div className="flex shrink-0 gap-x-2">{actions}</div>}
    </div>
  )
}

export const MerchantEmptyState = ({
  title,
  description,
}: {
  title: string
  description: string
}) => {
  return (
    <div className="flex flex-col items-center gap-y-1 px-6 py-16 text-center">
      <Text weight="plus">{title}</Text>
      <Text size="small" className="max-w-md text-ui-fg-subtle">
        {description}
      </Text>
    </div>
  )
}

export const MerchantPageSkeleton = () => {
  return (
    <Container className="divide-y p-0">
      <div className="space-y-2 px-6 py-4">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid gap-4 p-6 md:grid-cols-3">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
    </Container>
  )
}

export const statusColor = (
  status: string
): "green" | "red" | "blue" | "orange" | "grey" => {
  if (
    [
      "active",
      "published",
      "completed",
      "paid",
      "fulfilled",
      "shipped",
      "delivered",
    ].includes(status)
  ) {
    return "green"
  }
  if (["suspended", "disabled", "cancelled", "canceled", "rejected"].includes(status)) {
    return "red"
  }
  if (
    ["pending", "draft", "invited", "proposed", "not_fulfilled"].includes(
      status
    )
  ) {
    return "orange"
  }
  if (
    [
      "verified",
      "accepted",
      "partially_fulfilled",
      "partially_shipped",
      "partially_delivered",
    ].includes(status)
  ) {
    return "blue"
  }

  return "grey"
}
