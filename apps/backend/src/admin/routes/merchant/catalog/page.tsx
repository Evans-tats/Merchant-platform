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
import { Link } from "react-router-dom"

import { FieldError } from "../../../components/merchant/form-field"
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
  type MerchantCategoryListResponse,
  type MerchantCollectionListResponse,
  type MerchantSession,
} from "../../../lib/merchant-api"
import { CategoryStatusBadges } from "../categories/category-badges"
import { categoryQueryKeys } from "../categories/category-queries"
import { CreateCategoryModal } from "../categories/create-category-modal"
import { collectionQueryKeys } from "../collections/collection-queries"
import { CreateCollectionModal } from "../collections/create-collection-modal"

type ShippingProfile = { id: string; name: string; type: string }

type ShippingProfileFormValues = {
  name: string
  type: string
}

type ShippingProfileFormErrors = Partial<
  Record<keyof ShippingProfileFormValues, string>
>

function readShippingProfileForm(
  form: HTMLFormElement
): ShippingProfileFormValues {
  const data = new FormData(form)

  return {
    name: String(data.get("name") ?? "").trim(),
    type: String(data.get("type") ?? "").trim(),
  }
}

// Checked on submit so empty fields aren't flagged before anything is typed.
function validateShippingProfileForm(
  values: ShippingProfileFormValues
): ShippingProfileFormErrors {
  return {
    ...(!values.name && { name: "Enter a name" }),
    ...(!values.type && { type: "Enter a type" }),
  }
}

const CreateShippingProfileDrawer = ({
  open,
  session,
  onClose,
}: {
  open: boolean
  session: MerchantSession
  onClose: () => void
}) => {
  const queryClient = useQueryClient()
  const [errors, setErrors] = useState<ShippingProfileFormErrors>({})
  const close = () => {
    setErrors({})
    onClose()
  }
  const clearError = (field: keyof ShippingProfileFormValues) =>
    setErrors((current) => ({ ...current, [field]: undefined }))
  const createProfile = useMutation({
    mutationFn: (values: ShippingProfileFormValues) =>
      merchantApi.post(session.merchant.id, "/shipping-profiles", {
        shipping_profiles: [values],
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: merchantQueryKeys.resource(
          session.merchant.id,
          "shipping-profiles"
        ),
      })
      toast.success("Shipping profile created")
      close()
    },
    onError: (error) => toast.error(errorMessage(error)),
  })
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    // Read the form now: the event is gone by the time the mutation runs.
    const values = readShippingProfileForm(event.currentTarget)
    const nextErrors = validateShippingProfileForm(values)

    setErrors(nextErrors)

    if (!Object.values(nextErrors).some(Boolean)) {
      createProfile.mutate(values)
    }
  }

  return (
    <Drawer open={open} onOpenChange={(next) => !next && close()}>
      <Drawer.Content>
        <form className="flex h-full flex-col" noValidate onSubmit={submit}>
          <Drawer.Header>
            <Drawer.Title>Create shipping profile</Drawer.Title>
            <Drawer.Description>
              The profile will only be available to this merchant.
            </Drawer.Description>
          </Drawer.Header>
          <Drawer.Body className="flex flex-1 flex-col gap-y-4">
            <div className="flex flex-col gap-y-2">
              <Label htmlFor="shipping-name" size="small" weight="plus">Name</Label>
              <Input
                id="shipping-name"
                name="name"
                aria-invalid={Boolean(errors.name)}
                onChange={() => clearError("name")}
              />
              <FieldError message={errors.name} />
            </div>
            <div className="flex flex-col gap-y-2">
              <Label htmlFor="shipping-type" size="small" weight="plus">Type</Label>
              <Input
                id="shipping-type"
                name="type"
                defaultValue="default"
                aria-invalid={Boolean(errors.type)}
                onChange={() => clearError("type")}
              />
              <FieldError message={errors.type} />
            </div>
          </Drawer.Body>
          <Drawer.Footer>
            <Button
              size="small"
              type="button"
              variant="secondary"
              disabled={createProfile.isPending}
              onClick={close}
            >
              Cancel
            </Button>
            <Button size="small" type="submit" isLoading={createProfile.isPending}>Create</Button>
          </Drawer.Footer>
        </form>
      </Drawer.Content>
    </Drawer>
  )
}

export const MerchantCatalogContent = ({
  session,
}: {
  session: MerchantSession
}) => {
  const [shippingOpen, setShippingOpen] = useState(false)
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [collectionOpen, setCollectionOpen] = useState(false)
  const categoriesQuery = useQuery({
    queryKey: categoryQueryKeys.list(session.merchant.id),
    queryFn: () =>
      merchantApi.get<MerchantCategoryListResponse>(
        session.merchant.id,
        "/categories"
      ),
  })
  const collectionsQuery = useQuery({
    queryKey: collectionQueryKeys.list(session.merchant.id),
    queryFn: () =>
      merchantApi.get<MerchantCollectionListResponse>(
        session.merchant.id,
        "/collections"
      ),
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
  const categories = categoriesQuery.data?.product_categories ?? []
  const collections = collectionsQuery.data?.collections ?? []
  const shippingProfiles = shippingProfilesQuery.data ?? []

  return (
    <>
      <div className="flex flex-col gap-y-3">
        <Container className="divide-y p-0">
          <MerchantPageHeader
            title="Catalog organization"
            subtitle="Merchant-owned categories, collections, and shipping profiles"
          />
          <div className="flex items-center justify-between px-6 py-4">
            <Text weight="plus">Categories</Text>
            {canEdit && <Button size="small" variant="secondary" onClick={() => setCategoryOpen(true)}><Plus />Create category</Button>}
          </div>
          {categories.length ? (
            <Table>
              <Table.Header><Table.Row><Table.HeaderCell>Title</Table.HeaderCell><Table.HeaderCell>Handle</Table.HeaderCell><Table.HeaderCell>Status</Table.HeaderCell><Table.HeaderCell>Products</Table.HeaderCell></Table.Row></Table.Header>
              <Table.Body>{categories.map((category) => <Table.Row key={category.id}><Table.Cell><Link className="text-ui-fg-interactive font-medium" style={{ paddingLeft: `${category.depth * 16}px` }} to={`/merchant-categories/${category.id}`}>{category.name}</Link></Table.Cell><Table.Cell>/{category.handle}</Table.Cell><Table.Cell><CategoryStatusBadges category={category} /></Table.Cell><Table.Cell>{category.product_count}</Table.Cell></Table.Row>)}</Table.Body>
            </Table>
          ) : <MerchantEmptyState title="No categories" description="Create categories to organize this merchant's products." />}
        </Container>

        <Container className="divide-y p-0">
          <div className="flex items-center justify-between px-6 py-4">
            <div><Text weight="plus">Shipping profiles</Text><Text size="small" className="text-ui-fg-subtle">Assign these profiles from a product detail page.</Text></div>
            {canEdit && <Button size="small" variant="secondary" onClick={() => setShippingOpen(true)}><Plus />Create shipping profile</Button>}
          </div>
          {shippingProfiles.length ? <Table><Table.Header><Table.Row><Table.HeaderCell>Name</Table.HeaderCell><Table.HeaderCell>Type</Table.HeaderCell></Table.Row></Table.Header><Table.Body>{shippingProfiles.map((profile) => <Table.Row key={profile.id}><Table.Cell>{profile.name}</Table.Cell><Table.Cell>{profile.type}</Table.Cell></Table.Row>)}</Table.Body></Table> : <MerchantEmptyState title="No shipping profiles" description="Create a shipping profile for physical products." />}
        </Container>

        <Container className="divide-y p-0">
          <div className="flex items-center justify-between px-6 py-4">
            <Text weight="plus">Collections</Text>
            {canEdit && <Button size="small" variant="secondary" onClick={() => setCollectionOpen(true)}><Plus />Create collection</Button>}
          </div>
          {collections.length ? (
            <Table>
              <Table.Header><Table.Row><Table.HeaderCell>Title</Table.HeaderCell><Table.HeaderCell>Handle</Table.HeaderCell><Table.HeaderCell>Products</Table.HeaderCell></Table.Row></Table.Header>
              <Table.Body>{collections.map((collection) => <Table.Row key={collection.id}><Table.Cell><Link className="text-ui-fg-interactive font-medium" to={`/merchant-collections/${collection.id}`}>{collection.title}</Link></Table.Cell><Table.Cell>/{collection.handle}</Table.Cell><Table.Cell>{collection.product_count}</Table.Cell></Table.Row>)}</Table.Body>
            </Table>
          ) : <MerchantEmptyState title="No collections" description="Create a collection to group products for your storefront." />}
        </Container>
      </div>
      {canEdit && (
        <>
          <CreateShippingProfileDrawer
            open={shippingOpen}
            session={session}
            onClose={() => setShippingOpen(false)}
          />
          <CreateCategoryModal
            session={session}
            open={categoryOpen}
            onOpenChange={setCategoryOpen}
          />
          <CreateCollectionModal
            session={session}
            open={collectionOpen}
            onOpenChange={setCollectionOpen}
          />
        </>
      )}
    </>
  )
}

const MerchantCatalogPage = () => (
  <MerchantRoute>{(session) => <MerchantCatalogContent session={session} />}</MerchantRoute>
)

export const config = defineRouteConfig({})

export const handle = { breadcrumb: () => "Catalog" }

export default MerchantCatalogPage
