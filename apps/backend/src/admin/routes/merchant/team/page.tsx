import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Plus } from "@medusajs/icons"
import {
  Button,
  Container,
  Drawer,
  Heading,
  Input,
  Label,
  Select,
  StatusBadge,
  Table,
  Text,
  toast,
} from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { FormEvent, useState } from "react"

import {
  MerchantEmptyState,
  MerchantPageHeader,
  MerchantRoute,
  statusColor,
} from "../../../components/merchant/merchant-page"
import {
  canManageMerchant,
  errorMessage,
  formatDate,
  merchantApi,
  merchantQueryKeys,
  type MerchantInvitation,
  type MerchantMember,
  type MerchantRole,
  type MerchantSession,
} from "../../../lib/merchant-api"

type TeamResponse = {
  members: MerchantMember[]
  invitations: MerchantInvitation[]
}

const InviteMemberDrawer = ({
  session,
  open,
  onOpenChange,
}: {
  session: MerchantSession
  open: boolean
  onOpenChange: (open: boolean) => void
}) => {
  const [role, setRole] = useState<"admin" | "staff">("staff")
  const queryClient = useQueryClient()
  const inviteMember = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      merchantApi.post(session.merchant.id, "/members", body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: merchantQueryKeys.resource(session.merchant.id, "team"),
      })
      toast.success("Invitation created")
      onOpenChange(false)
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)

    inviteMember.mutate({
      email: String(formData.get("email") ?? "").trim(),
      role,
    })
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <Drawer.Content>
        <form className="flex h-full flex-col" onSubmit={handleSubmit}>
          <Drawer.Header>
            <Drawer.Title>Invite team member</Drawer.Title>
            <Drawer.Description>
              The invitation grants access only to {session.merchant.name}.
            </Drawer.Description>
          </Drawer.Header>
          <Drawer.Body className="flex flex-1 flex-col gap-y-4">
            <div className="flex flex-col gap-y-2">
              <Label htmlFor="invite-email">Email</Label>
              <Input id="invite-email" name="email" type="email" required />
            </div>
            <div className="flex flex-col gap-y-2">
              <Label>Role</Label>
              <Select
                value={role}
                onValueChange={(value) => setRole(value as "admin" | "staff")}
              >
                <Select.Trigger>
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value="staff">Staff</Select.Item>
                  <Select.Item value="admin">Administrator</Select.Item>
                </Select.Content>
              </Select>
            </div>
          </Drawer.Body>
          <Drawer.Footer>
            <Drawer.Close asChild>
              <Button type="button" variant="secondary">
                Cancel
              </Button>
            </Drawer.Close>
            <Button type="submit" isLoading={inviteMember.isPending}>
              Send invitation
            </Button>
          </Drawer.Footer>
        </form>
      </Drawer.Content>
    </Drawer>
  )
}

const MemberRow = ({
  session,
  member,
}: {
  session: MerchantSession
  member: MerchantMember
}) => {
  const [role, setRole] = useState<MerchantRole>(member.role)
  const [status, setStatus] = useState<"active" | "suspended">(
    member.status === "suspended" ? "suspended" : "active",
  )
  const queryClient = useQueryClient()
  const updateMember = useMutation({
    mutationFn: () =>
      merchantApi.post(session.merchant.id, `/members/${member.id}`, {
        role,
        status,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: merchantQueryKeys.resource(session.merchant.id, "team"),
        }),
        queryClient.invalidateQueries({
          queryKey: merchantQueryKeys.dashboard(session.merchant.id),
        }),
      ])
      toast.success("Team member updated")
    },
    onError: (error) => toast.error(errorMessage(error)),
  })
  const canEdit = session.member.role === "owner"
  const name = [member.user?.first_name, member.user?.last_name]
    .filter(Boolean)
    .join(" ")

  return (
    <Table.Row>
      <Table.Cell>
        <div className="flex flex-col">
          <Text weight="plus">{name || member.user?.email || "Member"}</Text>
          <Text size="xsmall" className="text-ui-fg-subtle">
            {member.user?.email || member.actor_id}
          </Text>
        </div>
      </Table.Cell>
      <Table.Cell>
        {canEdit ? (
          <Select
            size="small"
            value={role}
            onValueChange={(value) => setRole(value as MerchantRole)}
          >
            <Select.Trigger className="w-32">
              <Select.Value />
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="owner">Owner</Select.Item>
              <Select.Item value="admin">Admin</Select.Item>
              <Select.Item value="staff">Staff</Select.Item>
            </Select.Content>
          </Select>
        ) : (
          <Text size="small">{member.role}</Text>
        )}
      </Table.Cell>
      <Table.Cell>
        {canEdit ? (
          <Select
            size="small"
            value={status}
            onValueChange={(value) =>
              setStatus(value as "active" | "suspended")
            }
          >
            <Select.Trigger className="w-32">
              <Select.Value />
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="active">Active</Select.Item>
              <Select.Item value="suspended">Suspended</Select.Item>
            </Select.Content>
          </Select>
        ) : (
          <StatusBadge color={statusColor(member.status)}>
            {member.status}
          </StatusBadge>
        )}
      </Table.Cell>
      <Table.Cell className="text-right">
        {canEdit && (
          <Button
            size="small"
            variant="secondary"
            isLoading={updateMember.isPending}
            disabled={role === member.role && status === member.status}
            onClick={() => updateMember.mutate()}
          >
            Save
          </Button>
        )}
      </Table.Cell>
    </Table.Row>
  )
}

const MerchantTeamContent = ({ session }: { session: MerchantSession }) => {
  const [inviteOpen, setInviteOpen] = useState(false)
  const teamQuery = useQuery({
    queryKey: merchantQueryKeys.resource(session.merchant.id, "team"),
    queryFn: () =>
      merchantApi.get<TeamResponse>(session.merchant.id, "/members"),
  })

  if (teamQuery.isError) {
    throw teamQuery.error
  }

  const members = teamQuery.data?.members ?? []
  const invitations = (teamQuery.data?.invitations ?? []).filter(
    (invitation) => invitation.status === "pending",
  )

  return (
    <div className="flex flex-col gap-y-3">
      <Container className="divide-y p-0">
        <MerchantPageHeader
          title="Team"
          subtitle={`People with access to ${session.merchant.name}`}
          actions={
            canManageMerchant(session.member.role) ? (
              <Button size="small" onClick={() => setInviteOpen(true)}>
                <Plus />
                Invite member
              </Button>
            ) : undefined
          }
        />
        {members.length ? (
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Member</Table.HeaderCell>
                <Table.HeaderCell>Role</Table.HeaderCell>
                <Table.HeaderCell>Status</Table.HeaderCell>
                <Table.HeaderCell />
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {members.map((member) => (
                <MemberRow key={member.id} member={member} session={session} />
              ))}
            </Table.Body>
          </Table>
        ) : (
          <MerchantEmptyState
            title="No team members"
            description="Invite an administrator or staff member."
          />
        )}
      </Container>

      <Container className="divide-y p-0">
        <div className="px-6 py-4">
          <Heading level="h2">Pending invitations</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Invitations that have not been accepted
          </Text>
        </div>
        {invitations.length ? (
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Email</Table.HeaderCell>
                <Table.HeaderCell>Role</Table.HeaderCell>
                <Table.HeaderCell>Sent</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {invitations.map((invitation) => (
                <Table.Row key={invitation.id}>
                  <Table.Cell>{invitation.email}</Table.Cell>
                  <Table.Cell>{invitation.role}</Table.Cell>
                  <Table.Cell>{formatDate(invitation.created_at)}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        ) : (
          <MerchantEmptyState
            title="No pending invitations"
            description="New invitations will appear here until accepted."
          />
        )}
      </Container>

      <InviteMemberDrawer
        session={session}
        open={inviteOpen}
        onOpenChange={setInviteOpen}
      />
    </div>
  )
}

const MerchantTeamPage = () => {
  return (
    <MerchantRoute>
      {(session) => <MerchantTeamContent session={session} />}
    </MerchantRoute>
  )
}

export const config = defineRouteConfig({})

export const handle = {
  breadcrumb: () => "Team",
}

export default MerchantTeamPage
