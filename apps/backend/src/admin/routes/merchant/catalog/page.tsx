import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Plus } from "@medusajs/icons"
import {
  Button,
  Container,
  Drawer,
  Input,
  Label,
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
  errorMessage,
  merchantApi,
  merchantQueryKeys,
  type MerchantSession,
} from "../../../lib/merchant-api"

type Category = {
  id: string
  name: string
  handle: string
  description?: string | null
  parent_category_id?: string | null
}

type Collection = {
  id: string
  title: string
  handle: string
}

type ShippingProfile = { id: string; name: string; type: string }

type CatalogKind = "category" | "collection" | "shipping"
export type MerchantCatalogSection = "all" | "categories" | "collections"

const CreateCatalogDrawer = ({
  kind,
  session,
  onClose,
}: {
  kind: CatalogKind | null
  session: MerchantSession
  onClose: () => void
}) => {
  const queryClient = useQueryClient()
  const createEntry = useMutation({
    mutationFn: (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const form = new FormData(event.currentTarget)
      const name = String(form.get("name") ?? "").trim()
      const handle = String(form.get("handle") ?? "").trim()

      return merchantApi.post(
        session.merchant.id,
        kind === "category"
          ? "/categories"
          : kind === "collection"
            ? "/collections"
            : "/shipping-profiles",
        kind === "category"
          ? {
              product_categories: [{
                name,
                handle,
                description:
                  String(form.get("description") ?? "").trim() || undefined,
                is_active: true,
                is_internal: false,
              }],
            }
          : kind === "collection"
            ? { collections: [{ title: name, handle }] }
            : { shipping_profiles: [{ name, type: String(form.get("type") ?? "default").trim() }] }
      )
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: merchantQueryKeys.resource(
          session.merchant.id,
          kind === "category"
            ? "categories"
            : kind === "collection"
              ? "collections"
              : "shipping-profiles"
        ),
      })
      toast.success(`${kind === "category" ? "Category" : kind === "collection" ? "Collection" : "Shipping profile"} created`)
      onClose()
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  return (
    <Drawer open={Boolean(kind)} onOpenChange={(open) => !open && onClose()}>
      <Drawer.Content>
        <form className="flex h-full flex-col" onSubmit={(event) => createEntry.mutate(event)}>
          <Drawer.Header>
            <Drawer.Title>Create {kind}</Drawer.Title>
            <Drawer.Description>
              The entry will only be available to this merchant.
            </Drawer.Description>
          </Drawer.Header>
          <Drawer.Body className="flex flex-1 flex-col gap-y-4">
            <div className="flex flex-col gap-y-2">
              <Label htmlFor="catalog-name">Name</Label>
              <Input id="catalog-name" name="name" required />
            </div>
            {kind !== "shipping" && <div className="flex flex-col gap-y-2"><Label htmlFor="catalog-handle">Handle</Label><Input id="catalog-handle" name="handle" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required /></div>}
            {kind === "shipping" && <div className="flex flex-col gap-y-2"><Label htmlFor="shipping-type">Type</Label><Input id="shipping-type" name="type" defaultValue="default" required /></div>}
            {kind === "category" && (
              <div className="flex flex-col gap-y-2">
                <Label htmlFor="catalog-description">Description</Label>
                <Input id="catalog-description" name="description" />
              </div>
            )}
          </Drawer.Body>
          <Drawer.Footer>
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" isLoading={createEntry.isPending}>Create</Button>
          </Drawer.Footer>
        </form>
      </Drawer.Content>
    </Drawer>
  )
}

export const MerchantCatalogContent = ({
  session,
  section = "all",
}: {
  session: MerchantSession
  section?: MerchantCatalogSection
}) => {
  const [createKind, setCreateKind] = useState<CatalogKind | null>(null)
  const categoriesQuery = useQuery({
    queryKey: merchantQueryKeys.resource(session.merchant.id, "categories"),
    queryFn: async () => {
      const response = await merchantApi.get<{ product_categories: Category[] }>(
        session.merchant.id,
        "/categories"
      )
      return response.product_categories
    },
  })
  const collectionsQuery = useQuery({
    queryKey: merchantQueryKeys.resource(session.merchant.id, "collections"),
    queryFn: async () => {
      const response = await merchantApi.get<{ collections: Collection[] }>(
        session.merchant.id,
        "/collections"
      )
      return response.collections
    },
  })
  const shippingProfilesQuery = useQuery({
    queryKey: merchantQueryKeys.resource(session.merchant.id, "shipping-profiles"),
    queryFn: async () => {
      const response = await merchantApi.get<{ shipping_profiles: ShippingProfile[] }>(
        session.merchant.id,
        "/shipping-profiles"
      )
      return response.shipping_profiles
    },
  })

  if (categoriesQuery.isError) throw categoriesQuery.error
  if (collectionsQuery.isError) throw collectionsQuery.error
  if (shippingProfilesQuery.isError) throw shippingProfilesQuery.error

  const canEdit = canManageMerchant(session.member.role)
  const categories = categoriesQuery.data ?? []
  const collections = collectionsQuery.data ?? []
  const shippingProfiles = shippingProfilesQuery.data ?? []
  const pageTitle = section === "categories"
    ? "Categories"
    : section === "collections"
      ? "Collections"
      : "Catalog organization"
  const pageSubtitle = section === "categories"
    ? "Organize this merchant's products into a clear hierarchy"
    : section === "collections"
      ? "Curate groups of products for this merchant's storefront"
      : "Merchant-owned categories, collections, and shipping profiles"

  return (
    <>
      <div className="flex flex-col gap-y-3">
        <Container className="divide-y p-0">
          <MerchantPageHeader
            title={pageTitle}
            subtitle={pageSubtitle}
          />
          {(section === "all" || section === "categories") && (
            <>
          <div className="flex items-center justify-between px-6 py-4">
            <Text weight="plus">Categories</Text>
            {canEdit && <Button size="small" variant="secondary" onClick={() => setCreateKind("category")}><Plus />Create category</Button>}
          </div>
          {categories.length ? (
            <Table>
              <Table.Header><Table.Row><Table.HeaderCell>Name</Table.HeaderCell><Table.HeaderCell>Handle</Table.HeaderCell><Table.HeaderCell>Description</Table.HeaderCell></Table.Row></Table.Header>
              <Table.Body>{categories.map((category) => <Table.Row key={category.id}><Table.Cell>{category.name}</Table.Cell><Table.Cell>{category.handle}</Table.Cell><Table.Cell>{category.description || "-"}</Table.Cell></Table.Row>)}</Table.Body>
            </Table>
          ) : <MerchantEmptyState title="No categories" description="Create categories to organize this merchant's products." />}
            </>
          )}
        </Container>

        {section === "all" && <Container className="divide-y p-0">
          <div className="flex items-center justify-between px-6 py-4">
            <div><Text weight="plus">Shipping profiles</Text><Text size="small" className="text-ui-fg-subtle">Assign these profiles from a product detail page.</Text></div>
            {canEdit && <Button size="small" variant="secondary" onClick={() => setCreateKind("shipping")}><Plus />Create shipping profile</Button>}
          </div>
          {shippingProfiles.length ? <Table><Table.Header><Table.Row><Table.HeaderCell>Name</Table.HeaderCell><Table.HeaderCell>Type</Table.HeaderCell></Table.Row></Table.Header><Table.Body>{shippingProfiles.map((profile) => <Table.Row key={profile.id}><Table.Cell>{profile.name}</Table.Cell><Table.Cell>{profile.type}</Table.Cell></Table.Row>)}</Table.Body></Table> : <MerchantEmptyState title="No shipping profiles" description="Create a shipping profile for physical products." />}
        </Container>}

        {(section === "all" || section === "collections") && <Container className="divide-y p-0">
          <div className="flex items-center justify-between px-6 py-4">
            <Text weight="plus">Collections</Text>
            {canEdit && <Button size="small" variant="secondary" onClick={() => setCreateKind("collection")}><Plus />Create collection</Button>}
          </div>
          {collections.length ? (
            <Table>
              <Table.Header><Table.Row><Table.HeaderCell>Title</Table.HeaderCell><Table.HeaderCell>Handle</Table.HeaderCell></Table.Row></Table.Header>
              <Table.Body>{collections.map((collection) => <Table.Row key={collection.id}><Table.Cell>{collection.title}</Table.Cell><Table.Cell>{collection.handle}</Table.Cell></Table.Row>)}</Table.Body>
            </Table>
          ) : <MerchantEmptyState title="No collections" description="Create collections for curated merchant catalogs." />}
        </Container>}
      </div>
      <CreateCatalogDrawer kind={createKind} session={session} onClose={() => setCreateKind(null)} />
    </>
  )
}

const MerchantCatalogPage = () => (
  <MerchantRoute>{(session) => <MerchantCatalogContent session={session} />}</MerchantRoute>
)

export const config = defineRouteConfig({})

export const handle = { breadcrumb: () => "Catalog" }

export default MerchantCatalogPage
