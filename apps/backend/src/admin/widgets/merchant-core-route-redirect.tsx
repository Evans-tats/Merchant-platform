import { defineWidgetConfig } from "@medusajs/admin-sdk"
import {
  BellAlert,
  BellAlertDone,
  BuildingStorefront,
  ChartBar,
  CheckMini,
  ChevronDownMini,
  Clock,
  CogSixTooth,
  House,
  Sparkles,
  UserGroup,
} from "@medusajs/icons"
import { Button, DropdownMenu, IconButton, Text } from "@medusajs/ui"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"

import {
  merchantApi,
  merchantQueryKeys,
  setActiveMerchantId,
  type MerchantNotification,
} from "../lib/merchant-api"

const merchantRouteFor = (pathname: string): string | undefined => {
  if (pathname === "/") {
    return "/merchant"
  }

  if (pathname === "/merchant" || pathname.startsWith("/merchant/")) {
    return undefined
  }

  const detailRoutes = [
    { pattern: /^\/orders\/([^/]+)$/, target: "/merchant-orders" },
    { pattern: /^\/products\/([^/]+)$/, target: "/merchant-products" },
    {
      pattern: /^\/collections\/(?!create$)([^/]+)$/,
      target: "/merchant-collections",
    },
    {
      pattern: /^\/categories\/(?!create$|organize$)([^/]+)$/,
      target: "/merchant-categories",
    },
    { pattern: /^\/customers\/([^/]+)$/, target: "/merchant-customers" },
    {
      pattern: /^\/customer-groups\/(?!create$)([^/]+)$/,
      target: "/merchant-customer-segments",
    },
  ]

  for (const route of detailRoutes) {
    const match = pathname.match(route.pattern)

    if (match) {
      return `${route.target}/${match[1]}`
    }
  }

  if (pathname.startsWith("/orders")) return "/merchant-orders"
  if (pathname.startsWith("/draft-orders")) return "/merchant-draft-orders"
  if (pathname.startsWith("/products")) return "/merchant-products"
  if (pathname.startsWith("/collections")) return "/merchant-collections"
  if (pathname.startsWith("/categories")) return "/merchant-categories"
  if (pathname.startsWith("/product-options")) return "/merchant-products"
  if (pathname.startsWith("/inventory")) return "/merchant-inventory"
  if (pathname.startsWith("/reservations")) return "/merchant-inventory"
  if (pathname.startsWith("/customers")) return "/merchant-customers"
  if (pathname.startsWith("/customer-groups")) {
    return "/merchant-customer-segments"
  }
  if (pathname.startsWith("/settings")) return "/merchant/settings"
  if (pathname.startsWith("/promotions")) return "/merchant"
  if (pathname.startsWith("/campaigns")) return "/merchant"
  if (pathname.startsWith("/price-lists")) return "/merchant"

  return undefined
}

const updateMerchantNavigationLabel = (merchantName: string) => {
  const link = document.querySelector<HTMLAnchorElement>(
    'aside a[href="/app/merchant"]',
  )
  const label = link?.querySelector("p")
  const navigationEntry = link?.parentElement?.parentElement
  const searchButton = Array.from(
    document.querySelectorAll<HTMLButtonElement>("aside nav button"),
  ).find((button) => button.textContent?.trim().startsWith("Search"))

  if (link) {
    link.setAttribute("aria-label", `${merchantName} home`)
    link.setAttribute("title", `${merchantName} home`)
  }

  if (label) {
    label.textContent = merchantName
  }

  navigationEntry?.classList.add("merchant-home-navigation-entry")
  searchButton?.parentElement?.classList.add("merchant-search-navigation-entry")
}

const MerchantAdminShell = () => {
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const sessionQuery = useQuery({
    queryKey: merchantQueryKeys.session,
    queryFn: merchantApi.session,
    retry: false,
  })
  const session = sessionQuery.data
  const merchantId = session?.merchant.id ?? ""
  // Shares the notifications page's query key so marking a notification read
  // there clears the unread indicator here.
  const notificationsQuery = useQuery({
    queryKey: merchantQueryKeys.resource(merchantId, "notifications"),
    queryFn: async () =>
      (
        await merchantApi.get<{ notifications: MerchantNotification[] }>(
          merchantId,
          "/notifications",
        )
      ).notifications,
    enabled: Boolean(session),
    refetchInterval: 60_000,
  })
  const unreadCount = (notificationsQuery.data ?? []).filter(
    (notification) => !notification.read_at,
  ).length

  useEffect(() => {
    if (!session) {
      return
    }

    document.body.classList.add("merchant-workspace-active")
    const frame = window.requestAnimationFrame(() => {
      updateMerchantNavigationLabel(session.merchant.name)
    })

    return () => {
      window.cancelAnimationFrame(frame)
      document.body.classList.remove("merchant-workspace-active")
    }
  }, [location.pathname, session])

  useEffect(() => {
    if (!session) {
      return
    }

    const redirectMerchantNavigation = (event: MouseEvent) => {
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return
      }

      const link = (event.target as HTMLElement).closest<HTMLAnchorElement>(
        "aside a[href]",
      )

      if (!link) {
        return
      }

      const pathname =
        new URL(link.href, window.location.origin).pathname.replace(
          /^\/app/,
          "",
        ) || "/"
      const target = merchantRouteFor(pathname)

      if (target) {
        event.preventDefault()
        event.stopPropagation()
        navigate(target)
      }
    }

    document.addEventListener("click", redirectMerchantNavigation, true)

    return () => {
      document.removeEventListener("click", redirectMerchantNavigation, true)
    }
  }, [navigate, session])

  useEffect(() => {
    if (!session) {
      return
    }

    const target = merchantRouteFor(location.pathname)

    if (target) {
      navigate(target, { replace: true })
    }
  }, [location.pathname, navigate, session])

  if (!session) {
    return null
  }

  const selectMerchant = async (merchantId: string) => {
    if (merchantId === session.merchant.id) {
      return
    }

    setActiveMerchantId(merchantId)
    await queryClient.resetQueries({ queryKey: merchantQueryKeys.session })
    navigate("/merchant", { replace: true })
  }

  const brand = (
    <div className="flex min-w-0 items-center gap-x-2">
      <div className="merchant-brand-mark flex size-6 shrink-0 items-center justify-center rounded-md">
        <BuildingStorefront className="size-3.5" />
      </div>
      <div className="min-w-0 text-left">
        <Text size="small" leading="compact" weight="plus" className="truncate">
          {session.merchant.name}
        </Text>
        <Text size="xsmall" leading="compact" className="text-ui-fg-subtle">
          M-Pesa merchant
        </Text>
      </div>
    </div>
  )
  const workspaceLinks = [
    { label: "Home", to: "/merchant", icon: House },
    { label: "Reports", to: "/merchant/reports", icon: ChartBar },
    { label: "Assistant", to: "/merchant/assistant", icon: Sparkles },
    { label: "Team", to: "/merchant/team", icon: UserGroup },
    { label: "Settings", to: "/merchant/settings", icon: CogSixTooth },
    { label: "Activity", to: "/merchant/activity", icon: Clock },
  ]
  const notificationsLabel = unreadCount
    ? `Notifications (${unreadCount} unread)`
    : "Notifications"

  return (
    <div className="flex items-center gap-x-3">
      <IconButton
        asChild
        size="small"
        variant="transparent"
        className="text-ui-fg-muted hover:text-ui-fg-subtle"
      >
        <Link
          to="/merchant/notifications"
          aria-label={notificationsLabel}
          title={notificationsLabel}
        >
          {unreadCount ? <BellAlertDone /> : <BellAlert />}
        </Link>
      </IconButton>
      <DropdownMenu>
        <DropdownMenu.Trigger asChild>
          <Button
            size="small"
            variant="transparent"
            className="merchant-store-switcher h-auto min-w-52 justify-between py-1"
          >
            {brand}
            <ChevronDownMini className="text-ui-fg-muted" />
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content align="end" className="min-w-64">
          <DropdownMenu.Label>{session.merchant.name}</DropdownMenu.Label>
          <DropdownMenu.Separator />
          {workspaceLinks.map(({ label, to, icon: Icon }) => (
            <DropdownMenu.Item key={to} asChild>
              <Link to={to} className="flex items-center gap-x-2">
                <Icon className="text-ui-fg-subtle" />
                <Text size="small" leading="compact">
                  {label}
                </Text>
              </Link>
            </DropdownMenu.Item>
          ))}
          {session.memberships.length > 1 && (
            <>
              <DropdownMenu.Separator />
              <DropdownMenu.Label>Switch store</DropdownMenu.Label>
            </>
          )}
          {session.memberships.length > 1 &&
            session.memberships.map(({ merchant, member }) => (
              <DropdownMenu.Item
                key={merchant.id}
                className="flex items-center justify-between gap-x-3"
                onClick={() => selectMerchant(merchant.id)}
              >
                <div className="flex min-w-0 flex-col">
                  <Text
                    size="small"
                    leading="compact"
                    weight="plus"
                    className="truncate"
                  >
                    {merchant.name}
                  </Text>
                  <Text
                    size="xsmall"
                    leading="compact"
                    className="text-ui-fg-subtle"
                  >
                    {member.role}
                  </Text>
                </div>
                {merchant.id === session.merchant.id && (
                  <CheckMini className="text-ui-fg-interactive" />
                )}
              </DropdownMenu.Item>
            ))}
        </DropdownMenu.Content>
      </DropdownMenu>
    </div>
  )
}

export const config = defineWidgetConfig({
  zone: "topbar",
  id: "merchant:admin-shell",
})

export default MerchantAdminShell
