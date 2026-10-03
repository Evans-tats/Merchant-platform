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
  toast,
} from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { FormEvent, useState } from "react"
import { Link } from "react-router-dom"

import {
  MerchantEmptyState,
  MerchantPageHeader,
  MerchantRoute,
} from "../../../components/merchant/merchant-page"
import {
  canManageMerchant,
  errorMessage,
  formatDate,
  formatMoney,
  merchantApi,
  merchantQueryKeys,
  type MerchantOrder,
  type MerchantProduct,
  type MerchantSession,
} from "../../../lib/merchant-api"

const MerchantDraftOrdersContent = ({ session }: { session: MerchantSession }) => {
  const [open, setOpen] = useState(false)
  const [variantId, setVariantId] = useState("")
  const queryClient = useQueryClient()
  const draftsQuery = useQuery({
    queryKey: merchantQueryKeys.resource(session.merchant.id, "draft-orders"),
    queryFn: () => merchantApi.get<{ draft_orders: MerchantOrder[] }>(
      session.merchant.id,
      "/draft-orders"
    ),
  })
  const productsQuery = useQuery({
    queryKey: merchantQueryKeys.resource(session.merchant.id, "products"),
    queryFn: () => merchantApi.get<{ products: MerchantProduct[] }>(
      session.merchant.id,
      "/products"
    ),
  })
  const createDraft = useMutation({
    mutationFn: (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const form = new FormData(event.currentTarget)
      return merchantApi.post(session.merchant.id, "/draft-orders", {
        email: String(form.get("email") ?? "").trim(),
        items: [{
          variant_id: variantId,
          quantity: Number(form.get("quantity")),
        }],
      })
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: merchantQueryKeys.resource(session.merchant.id, "draft-orders") }),
        queryClient.invalidateQueries({ queryKey: merchantQueryKeys.resource(session.merchant.id, "orders") }),
      ])
      toast.success("Draft order created")
      setOpen(false)
      setVariantId("")
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  if (draftsQuery.isError) throw draftsQuery.error
  if (productsQuery.isError) throw productsQuery.error
  const drafts = draftsQuery.data?.draft_orders ?? []

  return (
    <>
      <Container className="divide-y p-0">
        <MerchantPageHeader
          title="Draft orders"
          subtitle="Create and manage merchant-owned draft orders"
          actions={canManageMerchant(session.member.role) ? <Button size="small" onClick={() => setOpen(true)}><Plus />Create draft order</Button> : undefined}
        />
        {drafts.length ? (
          <Table>
            <Table.Header><Table.Row><Table.HeaderCell>Order</Table.HeaderCell><Table.HeaderCell>Email</Table.HeaderCell><Table.HeaderCell>Total</Table.HeaderCell><Table.HeaderCell>Created</Table.HeaderCell></Table.Row></Table.Header>
            <Table.Body>{drafts.map((order) => <Table.Row key={order.id}><Table.Cell><Link className="text-ui-fg-interactive font-medium" to={`/merchant-orders/${order.id}`}>#{order.display_id}</Link></Table.Cell><Table.Cell>{order.email || "-"}</Table.Cell><Table.Cell>{formatMoney(order.total, order.currency_code)}</Table.Cell><Table.Cell>{formatDate(order.created_at)}</Table.Cell></Table.Row>)}</Table.Body>
          </Table>
        ) : <MerchantEmptyState title="No draft orders" description="Create a draft order for a customer from merchant-owned products." />}
      </Container>

      <Drawer open={open} onOpenChange={setOpen}>
        <Drawer.Content>
          <form className="flex h-full flex-col" onSubmit={(event) => createDraft.mutate(event)}>
            <Drawer.Header><Drawer.Title>Create draft order</Drawer.Title><Drawer.Description>The server selects the region and merchant sales channel.</Drawer.Description></Drawer.Header>
            <Drawer.Body className="flex flex-1 flex-col gap-y-4">
              <div className="flex flex-col gap-y-2"><Label htmlFor="draft-email">Customer email</Label><Input id="draft-email" name="email" type="email" required /></div>
              <div className="flex flex-col gap-y-2"><Label>Product variant</Label><Select value={variantId} onValueChange={setVariantId}><Select.Trigger><Select.Value placeholder="Select variant" /></Select.Trigger><Select.Content>{(productsQuery.data?.products ?? []).flatMap((product) => (product.variants ?? []).map((variant) => <Select.Item key={variant.id} value={variant.id}>{product.title} - {variant.title}</Select.Item>))}</Select.Content></Select></div>
              <div className="flex flex-col gap-y-2"><Label htmlFor="draft-quantity">Quantity</Label><Input id="draft-quantity" name="quantity" type="number" min="1" defaultValue="1" required /></div>
              {!productsQuery.data?.products.length && <StatusBadge color="orange">Create a product before creating a draft order</StatusBadge>}
            </Drawer.Body>
            <Drawer.Footer><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={!variantId} isLoading={createDraft.isPending}>Create</Button></Drawer.Footer>
          </form>
        </Drawer.Content>
      </Drawer>
    </>
  )
}

const MerchantDraftOrdersPage = () => (
  <MerchantRoute>{(session) => <MerchantDraftOrdersContent session={session} />}</MerchantRoute>
)

export const config = defineRouteConfig({})

export const handle = { breadcrumb: () => "Draft orders" }

export default MerchantDraftOrdersPage
