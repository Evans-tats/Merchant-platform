import {
  Button,
  Checkbox,
  Container,
  Drawer,
  Heading,
  Input,
  Label,
  StatusBadge,
  Table,
  Text,
  Textarea,
  toast,
} from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { FormEvent, useState } from "react"
import { Link, useParams } from "react-router-dom"

import {
  MerchantEmptyState,
  MerchantPageSkeleton,
  MerchantRoute,
  statusColor,
} from "../../../../components/merchant/merchant-page"
import {
  canManageMerchant,
  errorMessage,
  formatDate,
  formatMoney,
  merchantApi,
  merchantQueryKeys,
  type MerchantCustomer,
  type MerchantCustomerSegmentListResponse,
  type MerchantCustomerSegmentSummary,
  type MerchantSession,
} from "../../../../lib/merchant-api"

const CustomerSegmentsSection = ({
  session,
  customerId,
  segments,
  canEdit,
  onChanged,
}: {
  session: MerchantSession
  customerId: string
  segments: MerchantCustomerSegmentSummary[]
  canEdit: boolean
  onChanged: () => Promise<unknown>
}) => {
  const [open, setOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const queryClient = useQueryClient()
  const optionsQuery = useQuery({
    queryKey: [
      ...merchantQueryKeys.resource(session.merchant.id, "customer-segments"),
      "options",
    ],
    queryFn: () =>
      merchantApi.get<MerchantCustomerSegmentListResponse>(
        session.merchant.id,
        "/customer-segments?limit=100"
      ),
    enabled: open,
  })
  const saveSegments = useMutation({
    mutationFn: () => {
      const current = new Set(segments.map(({ id }) => id))
      const selected = new Set(selectedIds)

      return merchantApi.post(
        session.merchant.id,
        `/customers/${customerId}/segments`,
        {
          add: selectedIds.filter((id) => !current.has(id)),
          remove: segments
            .map(({ id }) => id)
            .filter((id) => !selected.has(id)),
        }
      )
    },
    onSuccess: async () => {
      await Promise.all([
        onChanged(),
        queryClient.invalidateQueries({
          queryKey: merchantQueryKeys.resource(
            session.merchant.id,
            "customer-segments"
          ),
        }),
      ])
      toast.success("Segments updated")
      setOpen(false)
    },
    onError: (error) => toast.error(errorMessage(error)),
  })
  const hasChanges =
    selectedIds.length !== segments.length ||
    segments.some(({ id }) => !selectedIds.includes(id))
  const options = optionsQuery.data?.customer_segments ?? []

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <div>
          <Heading level="h2">Segments</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Groups this customer belongs to in your workspace
          </Text>
        </div>
        {canEdit && (
          <Button
            size="small"
            variant="secondary"
            onClick={() => {
              setSelectedIds(segments.map(({ id }) => id))
              setOpen(true)
            }}
          >
            Manage
          </Button>
        )}
      </div>
      <div className="flex flex-wrap gap-2 px-6 py-4">
        {segments.length ? (
          segments.map((segment) => (
            <Link
              key={segment.id}
              to={`/merchant-customer-segments/${segment.id}`}
            >
              <StatusBadge color="blue">{segment.name}</StatusBadge>
            </Link>
          ))
        ) : (
          <Text size="small" leading="compact" className="text-ui-fg-subtle">
            Not in any segment
          </Text>
        )}
      </div>
      <Drawer open={open} onOpenChange={setOpen}>
        <Drawer.Content>
          <Drawer.Header>
            <Drawer.Title>Manage segments</Drawer.Title>
            <Drawer.Description>
              Choose which segments this customer belongs to.
            </Drawer.Description>
          </Drawer.Header>
          <Drawer.Body className="flex flex-1 flex-col gap-y-3 overflow-y-auto">
            {optionsQuery.isPending ? (
              <Text size="small" className="text-ui-fg-subtle">
                Loading segments...
              </Text>
            ) : options.length ? (
              options.map((segment) => (
                <div className="flex items-start gap-x-2" key={segment.id}>
                  <Checkbox
                    id={`customer-segment-${segment.id}`}
                    checked={selectedIds.includes(segment.id)}
                    onCheckedChange={(checked) =>
                      setSelectedIds((current) =>
                        checked === true
                          ? [...current, segment.id]
                          : current.filter((id) => id !== segment.id)
                      )
                    }
                  />
                  <div className="flex flex-col">
                    <Label
                      htmlFor={`customer-segment-${segment.id}`}
                      size="small"
                      weight="plus"
                    >
                      {segment.name}
                    </Label>
                    {segment.description && (
                      <Text size="small" className="text-ui-fg-subtle">
                        {segment.description}
                      </Text>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <MerchantEmptyState
                title="No segments yet"
                description="Create a segment from Customers > Customer segments first."
              />
            )}
          </Drawer.Body>
          <Drawer.Footer>
            <Drawer.Close asChild>
              <Button
                size="small"
                variant="secondary"
                disabled={saveSegments.isPending}
              >
                Cancel
              </Button>
            </Drawer.Close>
            <Button
              size="small"
              disabled={!hasChanges}
              isLoading={saveSegments.isPending}
              onClick={() => saveSegments.mutate()}
            >
              Save
            </Button>
          </Drawer.Footer>
        </Drawer.Content>
      </Drawer>
    </Container>
  )
}

const CustomerDetailsContent = ({ session }: { session: MerchantSession }) => {
  const { id = "" } = useParams()
  const [addressOpen, setAddressOpen] = useState(false)
  const [editingAddress, setEditingAddress] = useState<
    NonNullable<MerchantCustomer["addresses"]>[number] | null
  >(null)
  const queryClient = useQueryClient()
  const customerQuery = useQuery({
    queryKey: merchantQueryKeys.resource(
      session.merchant.id,
      `customers/${id}`
    ),
    queryFn: async () => {
      const response = await merchantApi.get<{ customer: MerchantCustomer }>(
        session.merchant.id,
        `/customers/${id}`
      )
      return response.customer
    },
    enabled: Boolean(id),
  })
  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: merchantQueryKeys.resource(
          session.merchant.id,
          `customers/${id}`
        ),
      }),
      queryClient.invalidateQueries({
        queryKey: merchantQueryKeys.resource(session.merchant.id, "customers"),
      }),
      queryClient.invalidateQueries({
        queryKey: merchantQueryKeys.dashboard(session.merchant.id),
      }),
    ])
  const updateCustomer = useMutation({
    mutationFn: (update: {
      first_name: string | null
      last_name: string | null
      company_name: string | null
      phone: string | null
    }) =>
      merchantApi.post(session.merchant.id, `/customers/${id}`, {
        update,
      }),
    onSuccess: async () => {
      await invalidate()
      toast.success("Customer updated")
    },
    onError: (error) => toast.error(errorMessage(error)),
  })
  const createAddress = useMutation({
    mutationFn: (address: {
      address_name: string | null
      first_name: string | null
      last_name: string | null
      address_1: string
      address_2: string | null
      city: string
      province: string | null
      postal_code: string | null
      country_code: string
      phone: string | null
    }) =>
      merchantApi.post(
        session.merchant.id,
        `/customers/${id}/addresses${editingAddress ? `/${editingAddress.id}` : ""}`,
        {
          address,
        }
      ),
    onSuccess: async () => {
      await invalidate()
      toast.success(editingAddress ? "Address updated" : "Address added")
      setAddressOpen(false)
      setEditingAddress(null)
    },
    onError: (error) => toast.error(errorMessage(error)),
  })
  const deleteAddress = useMutation({
    mutationFn: (addressId: string) =>
      merchantApi.delete(
        session.merchant.id,
        `/customers/${id}/addresses/${addressId}`
      ),
    onSuccess: async () => {
      await invalidate()
      toast.success("Address deleted")
    },
    onError: (error) => toast.error(errorMessage(error)),
  })
  const addNote = useMutation({
    mutationFn: (note: string) => {
      const preferences =
        customerQuery.data?.merchant_profile?.preferences ?? {}
      const currentNotes = Array.isArray(preferences.customer_notes)
        ? preferences.customer_notes
        : []

      return merchantApi.post(session.merchant.id, `/customers/${id}`, {
        update: {
          preferences: {
            customer_notes: [
              ...currentNotes,
              { note, created_at: new Date().toISOString() },
            ],
          },
        },
      })
    },
    onSuccess: async () => {
      await invalidate()
      toast.success("Customer note added")
    },
    onError: (error) => toast.error(errorMessage(error)),
  })
  const submitCustomer = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)

    updateCustomer.mutate({
      first_name: String(form.get("first_name") ?? "").trim() || null,
      last_name: String(form.get("last_name") ?? "").trim() || null,
      company_name: String(form.get("company_name") ?? "").trim() || null,
      phone: String(form.get("phone") ?? "").trim() || null,
    })
  }
  const submitAddress = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)

    createAddress.mutate({
      address_name: String(form.get("address_name") ?? "").trim() || null,
      first_name: String(form.get("first_name") ?? "").trim() || null,
      last_name: String(form.get("last_name") ?? "").trim() || null,
      address_1: String(form.get("address_1") ?? "").trim(),
      address_2: String(form.get("address_2") ?? "").trim() || null,
      city: String(form.get("city") ?? "").trim(),
      province: String(form.get("province") ?? "").trim() || null,
      postal_code: String(form.get("postal_code") ?? "").trim() || null,
      country_code: String(form.get("country_code") ?? "ke").toLowerCase(),
      phone: String(form.get("phone") ?? "").trim() || null,
    })
  }
  const submitNote = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)

    addNote.mutate(String(form.get("note") ?? "").trim())
  }

  if (customerQuery.isPending) return <MerchantPageSkeleton />
  if (customerQuery.isError || !customerQuery.data) throw customerQuery.error

  const customer = customerQuery.data
  const canEdit = canManageMerchant(session.member.role)

  return (
    <>
      <div className="flex flex-col gap-y-3">
        <Container className="p-0">
          <div className="flex items-start justify-between px-6 py-4">
            <div>
              <div className="flex items-center gap-2">
                <Heading>
                  {[customer.first_name, customer.last_name]
                    .filter(Boolean)
                    .join(" ") ||
                    customer.email ||
                    "Customer"}
                </Heading>
                <StatusBadge
                  color={statusColor(
                    customer.merchant_profile?.status || "active"
                  )}
                >
                  {customer.merchant_profile?.status || "active"}
                </StatusBadge>
              </div>
              <Text size="small" className="text-ui-fg-subtle">
                {customer.email || customer.id}
              </Text>
            </div>
            <Button size="small" variant="secondary" asChild>
              <Link to="/merchant-customers">Back</Link>
            </Button>
          </div>
        </Container>
        <div className="grid gap-3 xl:grid-cols-2">
          <Container className="divide-y p-0">
            <div className="px-6 py-4">
              <Heading level="h2">Customer details</Heading>
            </div>
            <form
              className="grid gap-4 p-6 md:grid-cols-2"
              onSubmit={submitCustomer}
            >
              {[
                {
                  name: "first_name",
                  label: "First name",
                  value: customer.first_name,
                },
                {
                  name: "last_name",
                  label: "Last name",
                  value: customer.last_name,
                },
                {
                  name: "company_name",
                  label: "Company",
                  value: customer.company_name,
                },
                { name: "phone", label: "Phone", value: customer.phone },
              ].map(({ name, label, value }) => (
                <div className="flex flex-col gap-y-2" key={name}>
                  <Label htmlFor={`customer-${name}`}>{label}</Label>
                  <Input
                    id={`customer-${name}`}
                    name={name}
                    defaultValue={value || ""}
                    disabled={!canEdit}
                  />
                </div>
              ))}
              {canEdit && (
                <div className="flex justify-end md:col-span-2">
                  <Button type="submit" isLoading={updateCustomer.isPending}>
                    Save
                  </Button>
                </div>
              )}
            </form>
          </Container>
          <Container className="divide-y p-0">
            <div className="flex items-center justify-between px-6 py-4">
              <Heading level="h2">Addresses</Heading>
              {canEdit && (
                <Button
                  size="small"
                  variant="secondary"
                  onClick={() => {
                    setEditingAddress(null)
                    setAddressOpen(true)
                  }}
                >
                  Add address
                </Button>
              )}
            </div>
            {(customer.addresses ?? []).length ? (
              <div className="divide-y">
                {customer.addresses!.map((address) => (
                  <div
                    className="flex items-start justify-between gap-3 p-6"
                    key={address.id}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <Text weight="plus">
                          {address.address_name || "Address"}
                        </Text>
                        {address.is_default_shipping && (
                          <StatusBadge color="blue">
                            Default shipping
                          </StatusBadge>
                        )}
                      </div>
                      <Text size="small" className="text-ui-fg-subtle">
                        {[
                          address.address_1,
                          address.address_2,
                          address.city,
                          address.province,
                          address.postal_code,
                          address.country_code?.toUpperCase(),
                        ]
                          .filter(Boolean)
                          .join(", ")}
                      </Text>
                    </div>
                    {canEdit && (
                      <div className="flex gap-2">
                        <Button
                          size="small"
                          variant="secondary"
                          onClick={() => {
                            setEditingAddress(address)
                            setAddressOpen(true)
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          size="small"
                          variant="danger"
                          isLoading={deleteAddress.isPending}
                          onClick={() => deleteAddress.mutate(address.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <MerchantEmptyState
                title="No addresses"
                description="No merchant-specific addresses have been saved."
              />
            )}
          </Container>
        </div>
        <CustomerSegmentsSection
          session={session}
          customerId={customer.id}
          segments={customer.segments ?? []}
          canEdit={canEdit}
          onChanged={invalidate}
        />
        <Container className="divide-y p-0">
          <div className="px-6 py-4">
            <Heading level="h2">Merchant notes</Heading>
            <Text size="small" className="text-ui-fg-subtle">
              Private notes for this merchant only
            </Text>
          </div>
          <div className="flex flex-col gap-y-3 p-6">
            {(Array.isArray(
              customer.merchant_profile?.preferences.customer_notes
            )
              ? customer.merchant_profile!.preferences.customer_notes
              : []
            ).map((entry, index) => {
              const note = entry as { note?: string; created_at?: string }
              return (
                <div
                  className="rounded-lg border p-3"
                  key={`${note.created_at}-${index}`}
                >
                  <Text>{note.note}</Text>
                  <Text size="xsmall" className="text-ui-fg-subtle">
                    {formatDate(note.created_at)}
                  </Text>
                </div>
              )
            })}
            {canEdit && (
              <form className="flex gap-2" onSubmit={submitNote}>
                <Textarea
                  name="note"
                  placeholder="Add a private customer note"
                  required
                />
                <Button type="submit" isLoading={addNote.isPending}>
                  Add note
                </Button>
              </form>
            )}
          </div>
        </Container>
        <Container className="divide-y p-0">
          <div className="px-6 py-4">
            <Heading level="h2">Orders</Heading>
          </div>
          {(customer.orders ?? []).length ? (
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Order</Table.HeaderCell>
                  <Table.HeaderCell>Status</Table.HeaderCell>
                  <Table.HeaderCell>Total</Table.HeaderCell>
                  <Table.HeaderCell>Created</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {customer.orders!.map((order) => (
                  <Table.Row key={order.id}>
                    <Table.Cell>
                      <Link
                        className="text-ui-fg-interactive font-medium"
                        to={`/merchant-orders/${order.id}`}
                      >
                        #{order.display_id}
                      </Link>
                    </Table.Cell>
                    <Table.Cell>{order.status}</Table.Cell>
                    <Table.Cell>
                      {formatMoney(order.total, order.currency_code)}
                    </Table.Cell>
                    <Table.Cell>{formatDate(order.created_at)}</Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          ) : (
            <MerchantEmptyState
              title="No orders"
              description="This customer has no orders with this merchant."
            />
          )}
        </Container>
      </div>
      <Drawer
        open={addressOpen}
        onOpenChange={(open) => {
          setAddressOpen(open)
          if (!open) setEditingAddress(null)
        }}
      >
        <Drawer.Content>
          <form className="flex h-full flex-col" onSubmit={submitAddress}>
            <Drawer.Header>
              <Drawer.Title>
                {editingAddress ? "Edit address" : "Add address"}
              </Drawer.Title>
              <Drawer.Description>
                This address is visible only in this merchant workspace.
              </Drawer.Description>
            </Drawer.Header>
            <Drawer.Body className="grid flex-1 grid-cols-2 gap-4">
              {[
                {
                  name: "address_name",
                  label: "Label",
                  value: editingAddress?.address_name,
                },
                {
                  name: "first_name",
                  label: "First name",
                  value: editingAddress?.first_name,
                },
                {
                  name: "last_name",
                  label: "Last name",
                  value: editingAddress?.last_name,
                },
                {
                  name: "address_1",
                  label: "Address line 1",
                  value: editingAddress?.address_1,
                },
                {
                  name: "address_2",
                  label: "Address line 2",
                  value: editingAddress?.address_2,
                },
                { name: "city", label: "City", value: editingAddress?.city },
                {
                  name: "province",
                  label: "Province",
                  value: editingAddress?.province,
                },
                {
                  name: "postal_code",
                  label: "Postal code",
                  value: editingAddress?.postal_code,
                },
                {
                  name: "country_code",
                  label: "Country code",
                  value: editingAddress?.country_code || "ke",
                },
                { name: "phone", label: "Phone", value: editingAddress?.phone },
              ].map(({ name, label, value }) => (
                <div
                  className={`flex flex-col gap-y-2 ${name === "address_1" || name === "address_2" ? "col-span-2" : ""}`}
                  key={name}
                >
                  <Label htmlFor={`address-${name}`}>{label}</Label>
                  <Input
                    key={`${editingAddress?.id}-${name}`}
                    id={`address-${name}`}
                    name={name}
                    defaultValue={value || ""}
                    required={["address_1", "city", "country_code"].includes(
                      name
                    )}
                  />
                </div>
              ))}
            </Drawer.Body>
            <Drawer.Footer>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setAddressOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" isLoading={createAddress.isPending}>
                {editingAddress ? "Save address" : "Add address"}
              </Button>
            </Drawer.Footer>
          </form>
        </Drawer.Content>
      </Drawer>
    </>
  )
}

const MerchantCustomerDetailsPage = () => (
  <MerchantRoute>
    {(session) => <CustomerDetailsContent session={session} />}
  </MerchantRoute>
)

export const handle = { breadcrumb: () => "Customer details" }

export default MerchantCustomerDetailsPage
