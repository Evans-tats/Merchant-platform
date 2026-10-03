import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Button, Container, Heading, StatusBadge, Text, toast } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { MerchantEmptyState, MerchantPageHeader, MerchantRoute } from "../../../components/merchant/merchant-page"
import { errorMessage, formatDate, merchantApi, merchantQueryKeys, type MerchantNotification, type MerchantSession } from "../../../lib/merchant-api"

const NotificationsContent = ({ session }: { session: MerchantSession }) => {
  const queryClient = useQueryClient()
  const queryKey = merchantQueryKeys.resource(session.merchant.id, "notifications")
  const notificationsQuery = useQuery({
    queryKey,
    queryFn: async () => (await merchantApi.get<{ notifications: MerchantNotification[] }>(session.merchant.id, "/notifications")).notifications,
  })
  const markRead = useMutation({
    mutationFn: (id: string) => merchantApi.post(session.merchant.id, `/notifications/${id}/read`, {}),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey }); toast.success("Notification marked as read") },
    onError: (error) => toast.error(errorMessage(error)),
  })

  if (notificationsQuery.isError) throw notificationsQuery.error
  const notifications = notificationsQuery.data ?? []

  return <Container className="divide-y p-0"><MerchantPageHeader title="Notifications" subtitle={`Operational alerts for ${session.merchant.name}`} />{notifications.length ? <div className="divide-y">{notifications.map((notification) => <div className="flex items-start justify-between gap-4 p-6" key={notification.id}><div className="flex flex-col gap-y-1"><div className="flex items-center gap-2"><Heading level="h3">{notification.title}</Heading><StatusBadge color={notification.severity === "critical" ? "red" : notification.severity === "warning" ? "orange" : "blue"}>{notification.severity}</StatusBadge>{!notification.read_at && <StatusBadge color="green">New</StatusBadge>}</div><Text size="small">{notification.message}</Text><Text size="xsmall" className="text-ui-fg-subtle">{formatDate(notification.created_at)}</Text></div>{!notification.read_at && <Button size="small" variant="secondary" isLoading={markRead.isPending && markRead.variables === notification.id} onClick={() => markRead.mutate(notification.id)}>Mark read</Button>}</div>)}</div> : <MerchantEmptyState title="No notifications" description="New orders, shipments, returns, and low-stock alerts will appear here." />}</Container>
}

const MerchantNotificationsPage = () => <MerchantRoute>{(session) => <NotificationsContent session={session} />}</MerchantRoute>
export const config = defineRouteConfig({})
export const handle = { breadcrumb: () => "Notifications" }
export default MerchantNotificationsPage
