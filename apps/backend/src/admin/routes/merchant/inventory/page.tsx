import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Plus } from "@medusajs/icons"
import {
  Button,
  Container,
  Drawer,
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
} from "../../../components/merchant/merchant-page"
import {
  canManageMerchant,
  downloadCsv,
  errorMessage,
  merchantApi,
  merchantQueryKeys,
  type MerchantSession,
  type MerchantInventoryItem,
  type MerchantStockLocation,
} from "../../../lib/merchant-api"

const SetStockDrawer = ({
  item,
  locations,
  session,
  onClose,
}: {
  item: MerchantInventoryItem | null
  locations: MerchantStockLocation[]
  session: MerchantSession
  onClose: () => void
}) => {
  const queryClient = useQueryClient()
  const [locationId, setLocationId] = useState("")
  const level = item?.location_levels.find(
    ({ location_id }) => location_id === locationId
  )
  const setStock = useMutation({
    mutationFn: (values: Record<string, unknown>) => {
      return merchantApi.post(session.merchant.id, "/inventory", {
        [level ? "update" : "create"]: [values],
      })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: merchantQueryKeys.resource(session.merchant.id, "inventory"),
      })
      toast.success("Stock level updated")
      onClose()
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  return (
    <Drawer open={Boolean(item)} onOpenChange={(open) => !open && onClose()}>
      <Drawer.Content>
        <form
          className="flex h-full flex-col"
          onSubmit={(event) => {
            event.preventDefault()
            const form = new FormData(event.currentTarget)

            setStock.mutate({
              id: level?.id,
              inventory_item_id: item!.id,
              location_id: locationId,
              stocked_quantity: Number(form.get("stocked_quantity")),
            })
          }}
        >
          <Drawer.Header><Drawer.Title>Set stock level</Drawer.Title><Drawer.Description>{item?.title}</Drawer.Description></Drawer.Header>
          <Drawer.Body className="flex flex-1 flex-col gap-y-4">
            <div className="flex flex-col gap-y-2"><Label>Location</Label><Select value={locationId} onValueChange={setLocationId}><Select.Trigger><Select.Value placeholder="Select a location" /></Select.Trigger><Select.Content>{locations.map((location) => <Select.Item key={location.id} value={location.id}>{location.name}</Select.Item>)}</Select.Content></Select></div>
            <div className="flex flex-col gap-y-2"><Label htmlFor="stocked-quantity">Stocked quantity</Label><Input key={`${item?.id}-${locationId}`} id="stocked-quantity" name="stocked_quantity" type="number" min="0" defaultValue={level?.stocked_quantity ?? 0} required /></div>
          </Drawer.Body>
          <Drawer.Footer><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" disabled={!locationId} isLoading={setStock.isPending}>Save stock</Button></Drawer.Footer>
        </form>
      </Drawer.Content>
    </Drawer>
  )
}

const CreateLocationDrawer = ({
  session,
  open,
  onOpenChange,
}: {
  session: MerchantSession
  open: boolean
  onOpenChange: (open: boolean) => void
}) => {
  const queryClient = useQueryClient()
  const createLocation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      merchantApi.post(
        session.merchant.id,
        "/inventory/locations",
        body
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: merchantQueryKeys.resource(
          session.merchant.id,
          "inventory"
        ),
      })
      await queryClient.invalidateQueries({
        queryKey: merchantQueryKeys.dashboard(session.merchant.id),
      })
      toast.success("Inventory location created")
      onOpenChange(false)
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)

    createLocation.mutate({
      locations: [
        {
          name: String(formData.get("name") ?? "").trim(),
          address: {
            address_1: String(formData.get("address_1") ?? "").trim(),
            city: String(formData.get("city") ?? "").trim(),
            country_code: String(
              formData.get("country_code") ?? "ke"
            ).toLowerCase(),
          },
        },
      ],
    })
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <Drawer.Content>
        <form className="flex h-full flex-col" onSubmit={handleSubmit}>
          <Drawer.Header>
            <Drawer.Title>Create location</Drawer.Title>
            <Drawer.Description>
              This location is automatically assigned to the merchant sales
              channel.
            </Drawer.Description>
          </Drawer.Header>
          <Drawer.Body className="flex flex-1 flex-col gap-y-4">
            <div className="flex flex-col gap-y-2">
              <Label htmlFor="location-name">Name</Label>
              <Input id="location-name" name="name" required />
            </div>
            <div className="flex flex-col gap-y-2">
              <Label htmlFor="location-address">Address</Label>
              <Input id="location-address" name="address_1" required />
            </div>
            <div className="grid grid-cols-[1fr_100px] gap-3">
              <div className="flex flex-col gap-y-2">
                <Label htmlFor="location-city">City</Label>
                <Input id="location-city" name="city" required />
              </div>
              <div className="flex flex-col gap-y-2">
                <Label htmlFor="location-country">Country</Label>
                <Input
                  id="location-country"
                  name="country_code"
                  defaultValue="ke"
                  maxLength={2}
                  required
                />
              </div>
            </div>
          </Drawer.Body>
          <Drawer.Footer>
            <Drawer.Close asChild>
              <Button variant="secondary" type="button">
                Cancel
              </Button>
            </Drawer.Close>
            <Button type="submit" isLoading={createLocation.isPending}>
              Create
            </Button>
          </Drawer.Footer>
        </form>
      </Drawer.Content>
    </Drawer>
  )
}

const MerchantInventoryContent = ({
  session,
}: {
  session: MerchantSession
}) => {
  const [createOpen, setCreateOpen] = useState(false)
  const [selectedItem, setSelectedItem] = useState<MerchantInventoryItem | null>(null)
  const inventoryQuery = useQuery({
    queryKey: merchantQueryKeys.resource(session.merchant.id, "inventory"),
    queryFn: async () => {
      const response = await merchantApi.get<{
        stock_locations: MerchantStockLocation[]
        inventory_items: MerchantInventoryItem[]
      }>(session.merchant.id, "/inventory")

      return response
    },
  })

  if (inventoryQuery.isError) {
    throw inventoryQuery.error
  }

  const locations = inventoryQuery.data?.stock_locations ?? []
  const inventoryItems = inventoryQuery.data?.inventory_items ?? []

  return (
    <>
      <div className="flex flex-col gap-y-3">
      <Container className="divide-y p-0">
        <MerchantPageHeader
          title="Inventory"
          subtitle={`Inventory items and stock assigned to ${session.merchant.name}`}
          actions={
            canManageMerchant(session.member.role) ? (
              <div className="flex gap-2">
                <Button size="small" variant="secondary" onClick={() => {
                  const exported = downloadCsv("merchant-inventory.csv", inventoryItems.flatMap((item) => item.location_levels.map((level) => ({
                    inventory_item_id: item.id,
                    title: item.title,
                    sku: item.sku,
                    location_id: level.location_id,
                    stocked_quantity: level.stocked_quantity,
                    reserved_quantity: level.reserved_quantity,
                    available_quantity: level.available_quantity,
                  }))))
                  if (!exported) toast.info("There are no stock levels to export")
                }}>Export CSV</Button>
                <Button size="small" onClick={() => setCreateOpen(true)}>
                  <Plus />
                  Create location
                </Button>
              </div>
            ) : undefined
          }
        />
        {inventoryItems.length ? (
          <Table>
            <Table.Header><Table.Row><Table.HeaderCell>Item</Table.HeaderCell><Table.HeaderCell>SKU</Table.HeaderCell><Table.HeaderCell>Stock</Table.HeaderCell><Table.HeaderCell>Reserved</Table.HeaderCell><Table.HeaderCell>Available</Table.HeaderCell><Table.HeaderCell /></Table.Row></Table.Header>
            <Table.Body>{inventoryItems.map((item) => {
              const stocked = item.location_levels.reduce((sum, level) => sum + Number(level.stocked_quantity ?? 0), 0)
              const reserved = item.location_levels.reduce((sum, level) => sum + Number(level.reserved_quantity ?? 0), 0)
              const available = item.location_levels.reduce((sum, level) => sum + Number(level.available_quantity ?? (level.stocked_quantity ?? 0) - (level.reserved_quantity ?? 0)), 0)
              return <Table.Row key={item.id}><Table.Cell><div className="flex flex-col"><Text weight="plus">{item.title}</Text><Text size="xsmall" className="text-ui-fg-subtle">{item.product.title} · {item.variant.title}</Text></div></Table.Cell><Table.Cell>{item.sku || "—"}</Table.Cell><Table.Cell>{stocked}</Table.Cell><Table.Cell>{reserved}</Table.Cell><Table.Cell><StatusBadge color={available <= 5 ? "orange" : "green"}>{available}</StatusBadge></Table.Cell><Table.Cell>{canManageMerchant(session.member.role) && <Button size="small" variant="secondary" onClick={() => setSelectedItem(item)}>Set stock</Button>}</Table.Cell></Table.Row>
            })}</Table.Body>
          </Table>
        ) : inventoryQuery.isPending ? (
          <div className="px-6 py-12 text-center"><Text className="text-ui-fg-subtle">Loading inventory…</Text></div>
        ) : (
          <MerchantEmptyState title="No inventory items" description="Enable inventory management on a product variant to manage stock here." />
        )}
      </Container>
      <Container className="divide-y p-0">
        <div className="px-6 py-4"><Text weight="plus">Stock locations</Text></div>
        {locations.length ? (
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Location</Table.HeaderCell>
                <Table.HeaderCell>Address</Table.HeaderCell>
                <Table.HeaderCell>City</Table.HeaderCell>
                <Table.HeaderCell>Country</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {locations.map((location) => (
                <Table.Row key={location.id}>
                  <Table.Cell>
                    <div className="flex flex-col">
                      <Text weight="plus">{location.name}</Text>
                      <Text size="xsmall" className="text-ui-fg-subtle">
                        {location.id}
                      </Text>
                    </div>
                  </Table.Cell>
                  <Table.Cell>{location.address?.address_1 || "—"}</Table.Cell>
                  <Table.Cell>{location.address?.city || "—"}</Table.Cell>
                  <Table.Cell>
                    {location.address?.country_code?.toUpperCase() || "—"}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        ) : inventoryQuery.isPending ? (
          <div className="px-6 py-12 text-center">
            <Text className="text-ui-fg-subtle">Loading locations…</Text>
          </div>
        ) : (
          <MerchantEmptyState
            title="No inventory locations"
            description="Create a location before managing merchant stock."
          />
        )}
      </Container>
      </div>
      <CreateLocationDrawer
        session={session}
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
      <SetStockDrawer item={selectedItem} locations={locations} session={session} onClose={() => setSelectedItem(null)} />
    </>
  )
}

const MerchantInventoryPage = () => {
  return (
    <MerchantRoute>
      {(session) => <MerchantInventoryContent session={session} />}
    </MerchantRoute>
  )
}

export const config = defineRouteConfig({})

export const handle = {
  breadcrumb: () => "Inventory",
}

export default MerchantInventoryPage
