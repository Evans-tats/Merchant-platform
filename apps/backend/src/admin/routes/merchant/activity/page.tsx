import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Container, StatusBadge, Table, Text } from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"

import { MerchantEmptyState, MerchantPageHeader, MerchantRoute } from "../../../components/merchant/merchant-page"
import { formatDate, merchantApi, merchantQueryKeys, type MerchantActivity, type MerchantSession } from "../../../lib/merchant-api"

const ActivityContent = ({ session }: { session: MerchantSession }) => {
  const activityQuery = useQuery({ queryKey: merchantQueryKeys.resource(session.merchant.id, "activity"), queryFn: async () => (await merchantApi.get<{ activities: MerchantActivity[] }>(session.merchant.id, "/activity")).activities })
  if (activityQuery.isError) throw activityQuery.error
  const activities = activityQuery.data ?? []
  return <Container className="divide-y p-0"><MerchantPageHeader title="Activity" subtitle={`Merchant audit history for ${session.merchant.name}`} />{activities.length ? <Table><Table.Header><Table.Row><Table.HeaderCell>Action</Table.HeaderCell><Table.HeaderCell>Description</Table.HeaderCell><Table.HeaderCell>Resource</Table.HeaderCell><Table.HeaderCell>Actor</Table.HeaderCell><Table.HeaderCell>Time</Table.HeaderCell></Table.Row></Table.Header><Table.Body>{activities.map((activity) => <Table.Row key={activity.id}><Table.Cell><StatusBadge color="blue">{activity.action}</StatusBadge></Table.Cell><Table.Cell><Text size="small">{activity.description}</Text></Table.Cell><Table.Cell>{activity.resource_type}{activity.resource_id ? ` · ${activity.resource_id}` : ""}</Table.Cell><Table.Cell>{activity.actor_id || "System"}</Table.Cell><Table.Cell>{formatDate(activity.created_at)}</Table.Cell></Table.Row>)}</Table.Body></Table> : <MerchantEmptyState title="No activity yet" description="Merchant operations will be recorded here." />}</Container>
}

const MerchantActivityPage = () => <MerchantRoute>{(session) => <ActivityContent session={session} />}</MerchantRoute>
export const config = defineRouteConfig({})
export const handle = { breadcrumb: () => "Activity" }
export default MerchantActivityPage
