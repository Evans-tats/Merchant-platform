import {
  Avatar,
  Button,
  Container,
  Heading,
  InlineTip,
  StatusBadge,
  Table,
  Text,
  toast,
} from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
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
  formatMoney,
  merchantApi,
  merchantQueryKeys,
  type MerchantCategoryListResponse,
  type MerchantDeliverySettings,
  type MerchantProduct,
  type MerchantSession,
} from "../../../../lib/merchant-api"
import { categoryChoices } from "../../categories/category-form"
import {
  GeneralEditDrawer,
  MediaEditDrawer,
  OrganizationEditDrawer,
  VariantsEditDrawer,
} from "./product-edit-drawers"

type ReferenceData = {
  categories: Array<{ id: string; name: string }>
  collections: Array<{ id: string; title: string }>
  shippingProfiles: Array<{ id: string; name: string; type: string }>
  regions: MerchantDeliverySettings["regions"]
}

const DetailRow = ({ label, value }: { label: string; value?: string | null }) => (
  <div className="grid gap-1 py-3 md:grid-cols-[180px_1fr]">
    <Text size="small" className="text-ui-fg-subtle">{label}</Text>
    <Text size="small">{value || "—"}</Text>
  </div>
)

const SectionHeader = ({
  title,
  description,
  canEdit,
  onEdit,
}: {
  title: string
  description: string
  canEdit: boolean
  onEdit: () => void
}) => (
  <div className="flex items-center justify-between px-6 py-4">
    <div>
      <Text size="small" weight="plus">{title}</Text>
      <Text size="small" className="text-ui-fg-subtle">{description}</Text>
    </div>
    {canEdit && <Button size="small" variant="secondary" onClick={onEdit}>Edit</Button>}
  </div>
)

const ProductDetailsContent = ({ session }: { session: MerchantSession }) => {
  const { id = "" } = useParams()
  const queryClient = useQueryClient()
  const [generalOpen, setGeneralOpen] = useState(false)
  const [mediaOpen, setMediaOpen] = useState(false)
  const [organizationOpen, setOrganizationOpen] = useState(false)
  const [variantsOpen, setVariantsOpen] = useState(false)
  const productQuery = useQuery({
    queryKey: merchantQueryKeys.resource(session.merchant.id, `products/${id}`),
    queryFn: async () => {
      const response = await merchantApi.get<{ product: MerchantProduct }>(
        session.merchant.id,
        `/products/${id}`
      )
      return response.product
    },
    enabled: Boolean(id),
  })
  const referencesQuery = useQuery({
    queryKey: merchantQueryKeys.resource(session.merchant.id, "product-references"),
    queryFn: async (): Promise<ReferenceData> => {
      const [categories, collections, deliverySettings] = await Promise.all([
        merchantApi.get<MerchantCategoryListResponse>(session.merchant.id, "/categories"),
        merchantApi.get<{ collections: ReferenceData["collections"] }>(session.merchant.id, "/collections"),
        merchantApi.get<MerchantDeliverySettings>(session.merchant.id, "/delivery-options"),
      ])
      return {
        categories: categoryChoices(categories.product_categories),
        collections: collections.collections,
        shippingProfiles: deliverySettings.shipping_profiles,
        regions: deliverySettings.regions,
      }
    },
  })
  const updateProduct = useMutation({
    mutationFn: (update: Record<string, unknown>) =>
      merchantApi.post(session.merchant.id, `/products/${id}`, { update }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: merchantQueryKeys.resource(session.merchant.id, `products/${id}`),
        }),
        queryClient.invalidateQueries({
          queryKey: merchantQueryKeys.resource(session.merchant.id, "products"),
        }),
        queryClient.invalidateQueries({
          queryKey: merchantQueryKeys.dashboard(session.merchant.id),
        }),
      ])
      setGeneralOpen(false)
      setMediaOpen(false)
      setOrganizationOpen(false)
      setVariantsOpen(false)
      toast.success("Product updated")
    },
    onError: (mutationError) => toast.error(errorMessage(mutationError)),
  })

  if (productQuery.isPending) return <MerchantPageSkeleton />
  if (productQuery.isError || !productQuery.data) throw productQuery.error

  const product = productQuery.data
  const canEdit = canManageMerchant(session.member.role)
  const references = referencesQuery.data ?? {
    categories: [],
    collections: [],
    shippingProfiles: [],
    regions: [],
  }

  return (
    <div className="flex flex-col gap-3">
      <Container className="divide-y p-0">
        <div className="flex items-start justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Avatar src={product.thumbnail ?? undefined} fallback={product.title.slice(0, 2).toUpperCase()} size="large" variant="squared" />
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <Heading>{product.title}</Heading>
                <StatusBadge color={statusColor(product.status)}>{product.status}</StatusBadge>
              </div>
              <Text size="small" className="text-ui-fg-subtle">/{product.handle}</Text>
            </div>
          </div>
          <Button size="small" variant="secondary" asChild><Link to="/merchant-products">Back to products</Link></Button>
        </div>
      </Container>

      {referencesQuery.isError && (
        <InlineTip variant="error" label="Product organization could not be loaded">
          {errorMessage(referencesQuery.error)}
        </InlineTip>
      )}

      <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <div className="flex flex-col gap-3">
          <Container className="divide-y p-0">
            <SectionHeader title="General" description="Customer-facing product information" canEdit={canEdit} onEdit={() => setGeneralOpen(true)} />
            <div className="divide-y px-6">
              <DetailRow label="Title" value={product.title} />
              <DetailRow label="Subtitle" value={product.subtitle} />
              <DetailRow label="Handle" value={product.handle} />
              <DetailRow label="Description" value={product.description} />
            </div>
          </Container>

          <Container className="divide-y p-0">
            <SectionHeader title="Variants" description="Prices, SKUs, and inventory behavior" canEdit={canEdit} onEdit={() => setVariantsOpen(true)} />
            {(product.variants ?? []).length ? (
              <Table>
                <Table.Header><Table.Row><Table.HeaderCell>Variant</Table.HeaderCell><Table.HeaderCell>SKU</Table.HeaderCell><Table.HeaderCell>Price</Table.HeaderCell><Table.HeaderCell>Inventory</Table.HeaderCell><Table.HeaderCell>Available</Table.HeaderCell></Table.Row></Table.Header>
                <Table.Body>
                  {product.variants!.map((variant) => {
                    const prices = variant.prices ?? []
                    const available = (variant.inventory ?? []).flatMap(({ location_levels: levels }) => levels ?? []).reduce((sum, level) => sum + (level.available_quantity ?? 0), 0)
                    return (
                      <Table.Row key={variant.id}>
                        <Table.Cell><Text size="small" weight="plus">{variant.title}</Text></Table.Cell>
                        <Table.Cell>{variant.sku || "—"}</Table.Cell>
                        <Table.Cell>{prices.length ? prices.map((price) => formatMoney(price.amount, price.currency_code)).join(" · ") : "Not set"}</Table.Cell>
                        <Table.Cell>{variant.manage_inventory ? "Managed" : "Not managed"}</Table.Cell>
                        <Table.Cell>{variant.manage_inventory ? available : "Always available"}</Table.Cell>
                      </Table.Row>
                    )
                  })}
                </Table.Body>
              </Table>
            ) : <MerchantEmptyState title="No variants" description="This product has no variants." />}
          </Container>
        </div>

        <div className="flex flex-col gap-3">
          <Container className="divide-y p-0">
            <SectionHeader title="Media" description="Thumbnail and product gallery" canEdit={canEdit} onEdit={() => setMediaOpen(true)} />
            <div className="flex flex-wrap gap-3 p-6">
              {(product.images ?? []).length ? product.images!.map((image) => <Avatar key={image.id} src={image.url} fallback="Image" size="large" variant="squared" />) : <Text size="small" className="text-ui-fg-subtle">No product media.</Text>}
            </div>
          </Container>

          <Container className="divide-y p-0">
            <SectionHeader title="Organization" description="Merchandising and fulfillment" canEdit={canEdit && !referencesQuery.isPending && !referencesQuery.isError} onEdit={() => setOrganizationOpen(true)} />
            <div className="divide-y px-6">
              <DetailRow label="Collection" value={product.collection?.title} />
              <DetailRow label="Categories" value={(product.categories ?? []).map(({ name }) => name).filter(Boolean).join(", ")} />
              <DetailRow label="Shipping profile" value={product.shipping_profile?.name} />
              <DetailRow label="Discountable" value={product.discountable === false ? "No" : "Yes"} />
            </div>
          </Container>
        </div>
      </div>

      {generalOpen && <GeneralEditDrawer product={product} open={generalOpen} onOpenChange={setGeneralOpen} onSubmit={(update) => updateProduct.mutate(update)} isPending={updateProduct.isPending} />}
      {mediaOpen && <MediaEditDrawer merchantId={session.merchant.id} product={product} open={mediaOpen} onOpenChange={setMediaOpen} onSubmit={(update) => updateProduct.mutate(update)} isPending={updateProduct.isPending} />}
      {organizationOpen && <OrganizationEditDrawer product={product} references={references} open={organizationOpen} onOpenChange={setOrganizationOpen} onSubmit={(update) => updateProduct.mutate(update)} isPending={updateProduct.isPending} />}
      {variantsOpen && <VariantsEditDrawer product={product} currencies={references.regions.map(({ currency_code }) => currency_code.toLowerCase())} open={variantsOpen} onOpenChange={setVariantsOpen} onSubmit={(update) => updateProduct.mutate(update)} isPending={updateProduct.isPending} />}
    </div>
  )
}

const MerchantProductDetailsPage = () => (
  <MerchantRoute>
    {(session) => <ProductDetailsContent session={session} />}
  </MerchantRoute>
)

export const handle = {
  breadcrumb: () => "Product details",
}

export default MerchantProductDetailsPage
