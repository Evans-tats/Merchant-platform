import {
  Alert,
  Avatar,
  Badge,
  Button,
  Checkbox,
  Container,
  Drawer,
  Heading,
  Input,
  Label,
  Prompt,
  Select,
  StatusBadge,
  Switch,
  Table,
  Text,
  Textarea,
  toast,
  usePrompt,
} from "@medusajs/ui"
import {
  ArchiveBox,
  CheckCircle,
  Spinner,
  TruckFast,
} from "@medusajs/icons"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { FormEvent, useEffect, useMemo, useState } from "react"
import { Link, useParams } from "react-router-dom"

import {
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
  type MerchantOrder,
  type MerchantSession,
} from "../../../../lib/merchant-api"
import {
  canFulfillMerchantOrder,
  fulfillableQuantity,
  fulfilledQuantity,
  orderedQuantity,
  orderCustomerPresentation,
  orderItemTotal,
} from "./order-detail-utils"
import {
  canCancelMerchantOrder,
  formatOrderWorkflowStatus,
  merchantOrderWorkflowStatus,
} from "../order-list-utils"

type OrderAction = "fulfill" | "refund" | "return" | "exchange" | "note" | "ship"

type FulfillmentOptions = {
  stock_locations: Array<{
    id: string
    name: string
    address?: {
      city?: string | null
      country_code?: string | null
    } | null
  }>
  default_location_id?: string
}

const invalidateOrderQueries = async (
  queryClient: ReturnType<typeof useQueryClient>,
  merchantId: string,
  orderId: string
) => {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: merchantQueryKeys.resource(merchantId, `orders/${orderId}`),
    }),
    queryClient.invalidateQueries({
      queryKey: merchantQueryKeys.resource(merchantId, "orders"),
    }),
  ])
}

const FulfillItemsDrawer = ({
  open,
  order,
  session,
  onClose,
}: {
  open: boolean
  order: MerchantOrder
  session: MerchantSession
  onClose: () => void
}) => {
  const queryClient = useQueryClient()
  const fulfillableItems = useMemo(
    () => (order.items ?? []).filter((item) => fulfillableQuantity(item) > 0),
    [order.items]
  )
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [locationId, setLocationId] = useState("")
  const [sendNotification, setSendNotification] = useState(
    !order.no_notification
  )
  const [errors, setErrors] = useState<{
    form?: string
    location?: string
    items?: Record<string, string>
  }>({})
  const optionsQuery = useQuery({
    queryKey: merchantQueryKeys.resource(
      session.merchant.id,
      `orders/${order.id}/fulfillment-options`
    ),
    queryFn: () =>
      merchantApi.get<FulfillmentOptions>(
        session.merchant.id,
        `/orders/${order.id}/fulfillments`
      ),
    enabled: open,
  })
  const createFulfillment = useMutation({
    mutationFn: (payload: {
      items: Array<{ id: string; quantity: number }>
      location_id: string
      no_notification: boolean
    }) =>
      merchantApi.post(
        session.merchant.id,
        `/orders/${order.id}/fulfillments`,
        payload
      ),
    onSuccess: async () => {
      await invalidateOrderQueries(
        queryClient,
        session.merchant.id,
        order.id
      )
      toast.success("Fulfillment created")
      onClose()
    },
    onError: (error) => {
      const message = errorMessage(error)
      setErrors((current) => ({ ...current, form: message }))
      toast.error(message)
    },
  })

  useEffect(() => {
    if (!open) {
      return
    }

    setQuantities(
      Object.fromEntries(
        fulfillableItems.map((item) => [item.id, fulfillableQuantity(item)])
      )
    )
    setSendNotification(!order.no_notification)
    setErrors({})
  }, [fulfillableItems, open, order.no_notification])

  useEffect(() => {
    if (!open || !optionsQuery.data) {
      return
    }

    const locations = optionsQuery.data.stock_locations
    const preferredLocation = optionsQuery.data.default_location_id

    setLocationId((current) => {
      if (locations.some(({ id }) => id === current)) {
        return current
      }

      if (preferredLocation) {
        return preferredLocation
      }

      return locations.length === 1 ? locations[0].id : ""
    })
  }, [open, optionsQuery.data])

  const selectedItems = fulfillableItems.filter(
    (item) => Number(quantities[item.id] ?? 0) > 0
  )
  const allSelected =
    fulfillableItems.length > 0 &&
    selectedItems.length === fulfillableItems.length
  const someSelected = selectedItems.length > 0 && !allSelected

  const toggleAll = (checked: boolean) => {
    setQuantities(
      Object.fromEntries(
        fulfillableItems.map((item) => [
          item.id,
          checked ? fulfillableQuantity(item) : 0,
        ])
      )
    )
    setErrors((current) => ({ ...current, form: undefined, items: undefined }))
  }

  const submitFulfillment = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const itemErrors: Record<string, string> = {}
    const items = fulfillableItems.flatMap((item) => {
      const quantity = Number(quantities[item.id] ?? 0)
      const remaining = fulfillableQuantity(item)

      if (quantity === 0) {
        return []
      }

      if (!Number.isInteger(quantity) || quantity < 1) {
        itemErrors[item.id] = "Enter a whole number greater than zero"
        return []
      }

      if (quantity > remaining) {
        itemErrors[item.id] = `Cannot exceed the remaining quantity of ${remaining}`
        return []
      }

      return [{ id: item.id, quantity }]
    })
    const nextErrors = {
      form: items.length === 0 ? "Select at least one item to fulfill" : undefined,
      location: locationId ? undefined : "Select a stock location",
      items: itemErrors,
    }

    if (
      nextErrors.form ||
      nextErrors.location ||
      Object.keys(itemErrors).length
    ) {
      setErrors(nextErrors)
      return
    }

    setErrors({})
    createFulfillment.mutate({
      items,
      location_id: locationId,
      no_notification: !sendNotification,
    })
  }

  return (
    <Drawer open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <Drawer.Content>
        <form className="flex h-full flex-col" onSubmit={submitFulfillment}>
          <Drawer.Header>
            <Drawer.Title>Fulfill items</Drawer.Title>
            <Drawer.Description>
              Order #{order.display_id} · Select the items and quantities to fulfill
            </Drawer.Description>
          </Drawer.Header>
          <Drawer.Body className="flex flex-1 flex-col gap-y-6 overflow-y-auto">
            {errors.form && (
              <Alert variant="error" dismissible={false}>
                {errors.form}
              </Alert>
            )}

            <div className="flex flex-col gap-y-2">
              <Label htmlFor="fulfillment-location">Stock location</Label>
              <Text size="small" leading="compact" className="text-ui-fg-subtle">
                Inventory will be fulfilled from this merchant-owned location.
              </Text>
              {optionsQuery.isPending ? (
                <div className="bg-ui-bg-subtle flex items-center justify-center rounded-md p-4">
                  <Spinner className="animate-spin" />
                </div>
              ) : optionsQuery.isError ? (
                <Alert variant="error" dismissible={false}>
                  {errorMessage(optionsQuery.error)}
                </Alert>
              ) : (
                <Select
                  value={locationId}
                  onValueChange={(value) => {
                    setLocationId(value)
                    setErrors((current) => ({ ...current, location: undefined }))
                  }}
                >
                  <Select.Trigger id="fulfillment-location">
                    <Select.Value placeholder="Select a stock location" />
                  </Select.Trigger>
                  <Select.Content>
                    {(optionsQuery.data?.stock_locations ?? []).map((location) => (
                      <Select.Item key={location.id} value={location.id}>
                        {location.name}
                        {location.address?.city ? ` · ${location.address.city}` : ""}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select>
              )}
              {errors.location && (
                <Text size="small" className="text-ui-fg-error">
                  {errors.location}
                </Text>
              )}
              {!optionsQuery.isPending &&
                !optionsQuery.isError &&
                !optionsQuery.data?.stock_locations.length && (
                  <Alert variant="warning" dismissible={false}>
                    No stock locations are configured for this merchant.
                  </Alert>
                )}
            </div>

            <div className="flex flex-col gap-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <Text size="small" leading="compact" weight="plus">
                    Items to fulfill
                  </Text>
                  <Text size="small" leading="compact" className="text-ui-fg-subtle">
                    Choose all remaining items or create a partial fulfillment.
                  </Text>
                </div>
                <div className="flex items-center gap-x-2">
                  <Checkbox
                    checked={allSelected ? true : someSelected ? "indeterminate" : false}
                    onCheckedChange={(checked) => toggleAll(checked === true)}
                    disabled={!fulfillableItems.length}
                  />
                  <Text size="small" leading="compact">Select all</Text>
                </div>
              </div>

              {fulfillableItems.length ? (
                <div className="flex flex-col gap-y-2">
                  {fulfillableItems.map((item) => {
                    const fulfilled = fulfilledQuantity(item)
                    const remaining = fulfillableQuantity(item)
                    const quantity = Number(quantities[item.id] ?? 0)

                    return (
                      <div
                        key={item.id}
                        className="shadow-elevation-card-rest bg-ui-bg-subtle rounded-xl p-3"
                      >
                        <div className="flex items-start gap-x-3">
                          <Checkbox
                            className="mt-3"
                            checked={quantity > 0}
                            onCheckedChange={(checked) => {
                              setQuantities((current) => ({
                                ...current,
                                [item.id]: checked === true ? remaining : 0,
                              }))
                              setErrors((current) => ({
                                ...current,
                                form: undefined,
                                items: { ...current.items, [item.id]: "" },
                              }))
                            }}
                          />
                          <Avatar
                            src={item.thumbnail ?? undefined}
                            fallback={(item.product_title || item.title).slice(0, 1)}
                            variant="squared"
                            size="large"
                          />
                          <div className="min-w-0 flex-1">
                            <Text size="small" leading="compact" weight="plus">
                              {item.product_title || item.title}
                            </Text>
                            <Text size="small" leading="compact" className="text-ui-fg-subtle">
                              {item.variant_title || "Default variant"}
                              {item.variant_sku ? ` · SKU ${item.variant_sku}` : ""}
                            </Text>
                            <div className="mt-3 grid grid-cols-3 gap-3">
                              <div>
                                <Text size="xsmall" className="text-ui-fg-subtle">Ordered</Text>
                                <Text size="small" weight="plus">{item.quantity}</Text>
                              </div>
                              <div>
                                <Text size="xsmall" className="text-ui-fg-subtle">Fulfilled</Text>
                                <Text size="small" weight="plus">{fulfilled}</Text>
                              </div>
                              <div>
                                <Text size="xsmall" className="text-ui-fg-subtle">Remaining</Text>
                                <Text size="small" weight="plus">{remaining}</Text>
                              </div>
                            </div>
                          </div>
                          <div className="flex w-20 flex-col gap-y-1">
                            <Label htmlFor={`fulfillment-quantity-${item.id}`}>Quantity</Label>
                            <Input
                              id={`fulfillment-quantity-${item.id}`}
                              type="number"
                              min={1}
                              max={remaining}
                              step={1}
                              value={quantity || ""}
                              onChange={(event) => {
                                const value = event.target.value === ""
                                  ? 0
                                  : Number(event.target.value)
                                setQuantities((current) => ({
                                  ...current,
                                  [item.id]: value,
                                }))
                                setErrors((current) => ({
                                  ...current,
                                  form: undefined,
                                  items: { ...current.items, [item.id]: "" },
                                }))
                              }}
                            />
                            <Text size="xsmall" className="text-ui-fg-subtle">
                              of {remaining}
                            </Text>
                          </div>
                        </div>
                        {errors.items?.[item.id] && (
                          <Text size="small" className="mt-2 text-ui-fg-error">
                            {errors.items[item.id]}
                          </Text>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <Alert variant="info" dismissible={false}>
                  Every item in this order has already been fulfilled.
                </Alert>
              )}
            </div>

            <div className="border-ui-border-base flex items-center justify-between border-t pt-6">
              <div>
                <Text size="small" leading="compact" weight="plus">
                  Send notification
                </Text>
                <Text size="small" leading="compact" className="text-ui-fg-subtle">
                  Notify the customer when the fulfillment is created.
                </Text>
              </div>
              <Switch
                checked={sendNotification}
                onCheckedChange={setSendNotification}
              />
            </div>
          </Drawer.Body>
          <Drawer.Footer>
            <Drawer.Close asChild>
              <Button size="small" type="button" variant="secondary" disabled={createFulfillment.isPending}>
                Cancel
              </Button>
            </Drawer.Close>
            <Button
              size="small"
              type="submit"
              isLoading={createFulfillment.isPending}
              disabled={
                createFulfillment.isPending ||
                optionsQuery.isPending ||
                !fulfillableItems.length ||
                !locationId
              }
            >
              Create fulfillment
            </Button>
          </Drawer.Footer>
        </form>
      </Drawer.Content>
    </Drawer>
  )
}

const OrderActionDrawer = ({
  action,
  order,
  session,
  initialFulfillmentId,
  onClose,
}: {
  action: OrderAction | null
  order: MerchantOrder
  session: MerchantSession
  initialFulfillmentId?: string
  onClose: () => void
}) => {
  const queryClient = useQueryClient()
  const [fulfillmentId, setFulfillmentId] = useState("")
  const [paymentId, setPaymentId] = useState("")
  const [returnLocationId, setReturnLocationId] = useState("")
  const [trackingNumber, setTrackingNumber] = useState("")
  const [trackingUrl, setTrackingUrl] = useState("")
  const [labelUrl, setLabelUrl] = useState("")
  const [shipmentError, setShipmentError] = useState("")
  const returnLocationsQuery = useQuery({
    queryKey: merchantQueryKeys.resource(
      session.merchant.id,
      `orders/${order.id}/fulfillment-options`
    ),
    queryFn: () =>
      merchantApi.get<FulfillmentOptions>(
        session.merchant.id,
        `/orders/${order.id}/fulfillments`
      ),
    enabled: action === "return",
  })
  const mutate = useMutation({
    mutationFn: (command: { path: string; body: Record<string, unknown> }) =>
      merchantApi.post(session.merchant.id, command.path, command.body),
    onSuccess: async () => {
      await invalidateOrderQueries(queryClient, session.merchant.id, order.id)
      toast.success("Order updated")
      onClose()
    },
    onError: (error) => toast.error(errorMessage(error)),
  })
  const payments = order.payment_collections?.flatMap(
    ({ payments }) => payments ?? []
  ) ?? []

  useEffect(() => {
    if (action !== "ship") {
      return
    }

    setFulfillmentId(
      initialFulfillmentId ||
        order.fulfillments?.find(
          ({ shipped_at, canceled_at }) => !shipped_at && !canceled_at
        )?.id ||
        ""
    )
    setTrackingNumber("")
    setTrackingUrl("")
    setLabelUrl("")
    setShipmentError("")
  }, [action, initialFulfillmentId, order.fulfillments])

  useEffect(() => {
    if (action !== "return" || !returnLocationsQuery.data) {
      return
    }

    const locations = returnLocationsQuery.data.stock_locations
    const preferredLocation = returnLocationsQuery.data.default_location_id

    setReturnLocationId((current) => {
      if (locations.some(({ id }) => id === current)) {
        return current
      }

      return preferredLocation || (locations.length === 1 ? locations[0].id : "")
    })
  }, [action, returnLocationsQuery.data])

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    let command: { path: string; body: Record<string, unknown> }

    if (action === "note") {
      command = {
        path: `/orders/${order.id}/notes`,
        body: { note: String(form.get("note") ?? "").trim() },
      }
    } else if (action === "ship") {
      const fulfillment = order.fulfillments?.find(
        ({ id }) => id === fulfillmentId
      )
      const trimmedTrackingNumber = trackingNumber.trim()
      const trimmedTrackingUrl = trackingUrl.trim()
      const trimmedLabelUrl = labelUrl.trim()
      const hasAnyLabelValue = Boolean(
        trimmedTrackingNumber || trimmedTrackingUrl || trimmedLabelUrl
      )

      if (
        hasAnyLabelValue &&
        (!trimmedTrackingNumber || !trimmedTrackingUrl || !trimmedLabelUrl)
      ) {
        setShipmentError(
          "Enter the tracking number, tracking URL, and label URL, or leave all three empty."
        )
        return
      }

      setShipmentError("")
      command = {
        path: `/orders/${order.id}/shipments`,
        body: {
          fulfillment_id: fulfillmentId,
          items: (fulfillment?.items ?? []).map((item) => ({
            id: item.line_item_id || item.id,
            quantity: Number(item.quantity),
          })),
          labels: hasAnyLabelValue
            ? [{
                tracking_number: trimmedTrackingNumber,
                tracking_url: trimmedTrackingUrl,
                label_url: trimmedLabelUrl,
              }]
            : undefined,
        },
      }
    } else if (action === "refund") {
      command = {
        path: `/orders/${order.id}/payments/${paymentId}/refund`,
        body: {
          amount: Number(form.get("amount")),
          note: String(form.get("note") ?? "").trim() || undefined,
        },
      }
    } else if (action === "exchange") {
      const note = String(form.get("note") ?? "").trim()
      command = {
        path: `/orders/${order.id}/exchanges`,
        body: { description: note || undefined, internal_note: note || undefined },
      }
    } else {
      command = {
        path: `/orders/${order.id}/returns`,
        body: {
          items: (order.items ?? []).map((item) => ({
            id: item.id,
            quantity: orderedQuantity(item),
          })),
          location_id: returnLocationId || undefined,
          note: String(form.get("note") ?? "").trim() || undefined,
          refund_amount: Number(form.get("refund_amount") || 0) || undefined,
          receive_now: true,
        },
      }
    }

    mutate.mutate(command)
  }

  return (
    <Drawer open={Boolean(action && action !== "fulfill")} onOpenChange={(open) => !open && onClose()}>
      <Drawer.Content>
        <form className="flex h-full flex-col" onSubmit={handleSubmit}>
          <Drawer.Header>
            <Drawer.Title>
              {action ? `${action[0].toUpperCase()}${action.slice(1)} order` : "Order action"}
            </Drawer.Title>
            <Drawer.Description>Order #{order.display_id}</Drawer.Description>
          </Drawer.Header>
          <Drawer.Body className="flex flex-1 flex-col gap-y-4">
            {action === "return" && (
              <div className="flex flex-col gap-y-2">
                <Label>Stock location</Label>
                {returnLocationsQuery.isPending ? (
                  <div className="bg-ui-bg-subtle flex items-center justify-center rounded-md p-4">
                    <Spinner className="animate-spin" />
                  </div>
                ) : returnLocationsQuery.isError ? (
                  <Alert variant="error" dismissible={false}>
                    {errorMessage(returnLocationsQuery.error)}
                  </Alert>
                ) : (
                  <Select
                    value={returnLocationId}
                    onValueChange={setReturnLocationId}
                  >
                    <Select.Trigger>
                      <Select.Value placeholder="Select stock location" />
                    </Select.Trigger>
                    <Select.Content>
                      {(returnLocationsQuery.data?.stock_locations ?? []).map(
                        (location) => (
                          <Select.Item key={location.id} value={location.id}>
                            {location.name}
                          </Select.Item>
                        )
                      )}
                    </Select.Content>
                  </Select>
                )}
              </div>
            )}
            {action === "ship" && (
              <>
                {shipmentError && (
                  <Alert variant="error" dismissible={false}>
                    {shipmentError}
                  </Alert>
                )}
                <div className="flex flex-col gap-y-2">
                  <Label>Fulfillment</Label>
                  <Select value={fulfillmentId} onValueChange={setFulfillmentId}>
                    <Select.Trigger><Select.Value placeholder="Select fulfillment" /></Select.Trigger>
                    <Select.Content>
                      {(order.fulfillments ?? []).filter(({ shipped_at, canceled_at }) => !shipped_at && !canceled_at).map((fulfillment) => (
                        <Select.Item key={fulfillment.id} value={fulfillment.id}>
                          {fulfillment.id}
                        </Select.Item>
                      ))}
                    </Select.Content>
                  </Select>
                </div>
                <div className="flex flex-col gap-y-2">
                  <Label htmlFor="tracking_number">Tracking number</Label>
                  <Input
                    id="tracking_number"
                    value={trackingNumber}
                    onChange={(event) => {
                      setTrackingNumber(event.target.value)
                      setShipmentError("")
                    }}
                    placeholder="123-456-789"
                  />
                </div>
                <div className="flex flex-col gap-y-2">
                  <Label htmlFor="tracking_url">Tracking URL</Label>
                  <Input
                    id="tracking_url"
                    value={trackingUrl}
                    onChange={(event) => {
                      setTrackingUrl(event.target.value)
                      setShipmentError("")
                    }}
                    type="url"
                    placeholder="https://carrier.example/track/123"
                  />
                </div>
                <div className="flex flex-col gap-y-2">
                  <Label htmlFor="label_url">Label URL</Label>
                  <Input
                    id="label_url"
                    value={labelUrl}
                    onChange={(event) => {
                      setLabelUrl(event.target.value)
                      setShipmentError("")
                    }}
                    type="url"
                    placeholder="https://carrier.example/labels/123.pdf"
                  />
                  <Text size="small" leading="compact" className="text-ui-fg-subtle">
                    Tracking details are optional. If provided, all three fields are required.
                  </Text>
                </div>
              </>
            )}
            {action === "refund" && (
              <>
                <div className="flex flex-col gap-y-2">
                  <Label>Payment</Label>
                  <Select value={paymentId} onValueChange={setPaymentId}>
                    <Select.Trigger><Select.Value placeholder="Select payment" /></Select.Trigger>
                    <Select.Content>
                      {payments.map((payment) => (
                        <Select.Item key={payment.id} value={payment.id}>
                          {payment.id} · {formatMoney(payment.amount, payment.currency_code || order.currency_code)}
                        </Select.Item>
                      ))}
                    </Select.Content>
                  </Select>
                </div>
                <div className="flex flex-col gap-y-2">
                  <Label htmlFor="refund_amount">Refund amount</Label>
                  <Input id="refund_amount" name="amount" type="number" min="0.01" step="0.01" required />
                </div>
              </>
            )}
            {action === "return" && (
              <div className="flex flex-col gap-y-2">
                <Label htmlFor="return_refund_amount">Refund amount</Label>
                <Input id="return_refund_amount" name="refund_amount" type="number" min="0" step="0.01" />
              </div>
            )}
            {(action === "note" || action === "refund" || action === "return" || action === "exchange") && (
              <div className="flex flex-col gap-y-2">
                <Label htmlFor="order_note">Internal note</Label>
                <Textarea id="order_note" name="note" required={action === "note"} />
              </div>
            )}
            {action === "return" && (
              <Text size="small" className="text-ui-fg-subtle">
                This action applies to all currently displayed order items. Partial quantities can be added in a later operation.
              </Text>
            )}
          </Drawer.Body>
          <Drawer.Footer>
            <Button size="small" type="button" variant="secondary" disabled={mutate.isPending} onClick={onClose}>Cancel</Button>
            <Button size="small" type="submit" disabled={mutate.isPending || (action === "ship" && !fulfillmentId) || (action === "refund" && !paymentId)} isLoading={mutate.isPending}>Confirm</Button>
          </Drawer.Footer>
        </form>
      </Drawer.Content>
    </Drawer>
  )
}

const CustomerCard = ({ order }: { order: MerchantOrder }) => {
  const customer = orderCustomerPresentation(order)

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between gap-2 px-6 py-4">
        <Heading level="h2">Customer</Heading>
        <Badge color={customer.accountLabel === "Registered customer" ? "green" : "grey"}>
          {customer.accountLabel}
        </Badge>
      </div>
      <div className="flex items-start gap-3 px-6 py-4">
        <Avatar fallback={customer.name.slice(0, 1)} />
        <div className="min-w-0 flex-1">
          <Text size="small" leading="compact" weight="plus">
            {customer.name}
          </Text>
          {customer.companyName && (
            <Text size="small" leading="compact" className="text-ui-fg-subtle">
              {customer.companyName}
            </Text>
          )}
          <Text size="small" leading="compact" className="text-ui-fg-subtle">
            {customer.email || "No email provided"}
          </Text>
          <Text size="small" leading="compact" className="text-ui-fg-subtle">
            {customer.phone || "No phone provided"}
          </Text>
        </div>
      </div>
    </Container>
  )
}

const AddressCard = ({
  title,
  address,
}: {
  title: string
  address: MerchantOrder["shipping_address"]
}) => {
  const name = [address?.first_name, address?.last_name]
    .filter(Boolean)
    .join(" ")
  const locality = [
    address?.city,
    address?.province,
    address?.postal_code,
    address?.country_code?.toUpperCase(),
  ]
    .filter(Boolean)
    .join(", ")
  const lines = [
    name,
    address?.company,
    address?.address_1,
    address?.address_2,
    locality,
    address?.phone,
  ].filter(Boolean) as string[]

  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h2">{title}</Heading>
      </div>
      <div className="flex flex-col gap-1 px-6 py-4">
        {lines.length ? (
          lines.map((line, index) => (
            <Text
              key={`${line}-${index}`}
              size="small"
              leading="compact"
              className={index === 0 ? undefined : "text-ui-fg-subtle"}
              weight={index === 0 ? "plus" : undefined}
            >
              {line}
            </Text>
          ))
        ) : (
          <Text size="small" leading="compact" className="text-ui-fg-subtle">
            No {title.toLowerCase()}
          </Text>
        )}
      </div>
    </Container>
  )
}

const OrderDetailsContent = ({ session }: { session: MerchantSession }) => {
  const { id = "" } = useParams()
  const [action, setAction] = useState<OrderAction | null>(null)
  const [shipFulfillmentId, setShipFulfillmentId] = useState("")
  const [deliveryFulfillmentId, setDeliveryFulfillmentId] = useState("")
  const [deliveryPromptOpen, setDeliveryPromptOpen] = useState(false)
  const [sendDeliveryNotification, setSendDeliveryNotification] = useState(
    true
  )
  const prompt = usePrompt()
  const queryClient = useQueryClient()
  const orderQuery = useQuery({
    queryKey: merchantQueryKeys.resource(session.merchant.id, `orders/${id}`),
    queryFn: async () => {
      const response = await merchantApi.get<{ order: MerchantOrder }>(
        session.merchant.id,
        `/orders/${id}`
      )
      return response.order
    },
    enabled: Boolean(id),
  })
  const cancelOrder = useMutation({
    mutationFn: () => merchantApi.post(session.merchant.id, `/orders/${id}/cancel`, {}),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: merchantQueryKeys.resource(session.merchant.id, `orders/${id}`),
      })
      toast.success("Order cancelled")
    },
    onError: (error) => toast.error(errorMessage(error)),
  })
  const deliverFulfillment = useMutation({
    mutationFn: ({
      fulfillmentId,
      noNotification,
    }: {
      fulfillmentId: string
      noNotification: boolean
    }) =>
      merchantApi.post(
        session.merchant.id,
        `/orders/${id}/fulfillments/${fulfillmentId}/deliver`,
        { no_notification: noNotification }
      ),
    onSuccess: async () => {
      await invalidateOrderQueries(queryClient, session.merchant.id, id)
      toast.success("Fulfillment marked as delivered")
      setDeliveryPromptOpen(false)
      setDeliveryFulfillmentId("")
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  if (orderQuery.isPending) return <MerchantPageSkeleton />
  if (orderQuery.isError || !orderQuery.data) throw orderQuery.error

  const order = orderQuery.data
  const canManage = canManageMerchant(session.member.role)
  const workflowStatus = merchantOrderWorkflowStatus(order)
  const notes = order.metadata?.merchant_notes ?? []

  return (
    <div className="flex flex-col gap-y-3">
      <Container className="p-0">
        <div className="flex flex-wrap items-start justify-between gap-3 px-6 py-4">
          <div>
            <div className="flex items-center gap-2">
              <Heading>Order #{order.display_id}</Heading>
              <StatusBadge color={statusColor(workflowStatus)}>
                {formatOrderWorkflowStatus(workflowStatus)}
              </StatusBadge>
            </div>
            <Text size="small" className="text-ui-fg-subtle">{order.email || "No customer email"} · {formatDate(order.created_at)}</Text>
          </div>
          <div className="flex flex-wrap gap-2">
          <Button size="small" variant="secondary" asChild><Link to="/merchant-orders">Back</Link></Button>
            <Button size="small" variant="secondary" onClick={() => setAction("note")}>Add note</Button>
            {canFulfillMerchantOrder(session.member.role, order.items) && (
              <Button size="small" variant="secondary" onClick={() => setAction("fulfill")}>
                <ArchiveBox /> Fulfill order
              </Button>
            )}
            {canManage && (order.fulfillments ?? []).some(({ shipped_at, canceled_at }) => !shipped_at && !canceled_at) && (
              <Button size="small" variant="secondary" onClick={() => {
                setShipFulfillmentId("")
                setAction("ship")
              }}>
                <TruckFast /> Create shipment
              </Button>
            )}
            {canManage && <Button size="small" variant="secondary" onClick={() => setAction("return")}>Return</Button>}
            {canManage && <Button size="small" variant="secondary" onClick={() => setAction("exchange")}>Exchange</Button>}
            {canManage && <Button size="small" variant="secondary" onClick={() => setAction("refund")}>Refund</Button>}
            {canManage && canCancelMerchantOrder(order) && (
              <Button size="small" variant="danger" isLoading={cancelOrder.isPending} onClick={async () => {
                const confirmed = await prompt({ title: `Cancel order #${order.display_id}?`, description: "This action cannot be undone.", confirmText: "Cancel order", variant: "danger" })
                if (confirmed) cancelOrder.mutate()
              }}>Cancel order</Button>
            )}
          </div>
        </div>
      </Container>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-y-3">
          <Container className="divide-y p-0">
            <div className="px-6 py-4"><Heading level="h2">Items</Heading></div>
            <Table>
              <Table.Header><Table.Row><Table.HeaderCell>Item</Table.HeaderCell><Table.HeaderCell>Quantity</Table.HeaderCell><Table.HeaderCell>Total</Table.HeaderCell></Table.Row></Table.Header>
              <Table.Body>
                {(order.items ?? []).map((item) => {
                  const total = orderItemTotal(item)

                  return (
                    <Table.Row key={item.id}>
                      <Table.Cell><div className="flex flex-col"><Text weight="plus">{item.product_title || item.title || "Untitled item"}</Text><Text size="xsmall" className="text-ui-fg-subtle">{item.variant_title || item.variant_sku || "Default variant"}</Text></div></Table.Cell>
                      <Table.Cell>{orderedQuantity(item)}</Table.Cell>
                      <Table.Cell>{total === undefined ? "—" : formatMoney(total, order.currency_code)}</Table.Cell>
                    </Table.Row>
                  )
                })}
              </Table.Body>
            </Table>
          </Container>
          <Container className="divide-y p-0">
            <div className="px-6 py-4"><Heading level="h2">Timeline and notes</Heading></div>
            <div className="flex flex-col gap-y-4 p-6">
              <div className="flex items-center justify-between"><Text>Order created</Text><Text size="small" className="text-ui-fg-subtle">{formatDate(order.created_at)}</Text></div>
              {(order.fulfillments ?? []).map((fulfillment) => (
                <div className="flex items-start justify-between gap-3" key={fulfillment.id}>
                  <div>
                    <Text size="small" leading="compact" weight="plus">
                      Fulfillment created
                    </Text>
                    <Text size="small" leading="compact" className="text-ui-fg-subtle">
                      {fulfillment.items?.reduce((total, item) => total + Number(item.quantity), 0) ?? 0} item(s) · {fulfillment.id}
                    </Text>
                  </div>
                  <Text size="small" className="text-ui-fg-subtle">
                    {formatDate(fulfillment.created_at)}
                  </Text>
                </div>
              ))}
              {(order.fulfillments ?? [])
                .filter(({ shipped_at }) => Boolean(shipped_at))
                .map((fulfillment) => (
                  <div
                    className="flex items-start justify-between gap-3"
                    key={`${fulfillment.id}-shipped`}
                  >
                    <Text size="small" leading="compact" weight="plus">
                      Fulfillment shipped
                    </Text>
                    <Text size="small" className="text-ui-fg-subtle">
                      {formatDate(fulfillment.shipped_at ?? undefined)}
                    </Text>
                  </div>
                ))}
              {(order.fulfillments ?? [])
                .filter(({ delivered_at }) => Boolean(delivered_at))
                .map((fulfillment) => (
                  <div
                    className="flex items-start justify-between gap-3"
                    key={`${fulfillment.id}-delivered`}
                  >
                    <Text size="small" leading="compact" weight="plus">
                      Fulfillment delivered
                    </Text>
                    <Text size="small" className="text-ui-fg-subtle">
                      {formatDate(fulfillment.delivered_at ?? undefined)}
                    </Text>
                  </div>
                ))}
              {notes.map((note) => (
                <div key={note.id} className="rounded-lg border p-3"><Text>{note.note}</Text><Text size="xsmall" className="text-ui-fg-subtle">{formatDate(note.created_at)}</Text></div>
              ))}
            </div>
          </Container>
        </div>
        <div className="flex flex-col gap-y-3">
          <CustomerCard order={order} />
          <Container className="p-6">
            <Heading level="h2">Summary</Heading>
            <div className="mt-4 flex flex-col gap-y-2">
              {[['Subtotal', order.subtotal], ['Shipping', order.shipping_total], ['Tax', order.tax_total], ['Discount', -(order.discount_total ?? 0)], ['Total', order.total]].map(([label, value]) => (
                <div className="flex justify-between" key={String(label)}><Text size="small">{label}</Text><Text size="small" weight={label === 'Total' ? 'plus' : undefined}>{formatMoney(Number(value ?? 0), order.currency_code)}</Text></div>
              ))}
            </div>
          </Container>
          <Container className="p-6">
            <div className="flex items-center justify-between">
              <Heading level="h2">Fulfillment</Heading>
              <StatusBadge color={statusColor(order.fulfillment_status || "not_fulfilled")}>
                {(order.fulfillment_status || "not_fulfilled").replace(/_/g, " ")}
              </StatusBadge>
            </div>
            <div className="mt-4 flex flex-col gap-y-2">
              {(order.fulfillments ?? []).length ? order.fulfillments!.map((fulfillment) => (
                <div className="bg-ui-bg-subtle shadow-elevation-card-rest flex flex-col gap-y-2 rounded-lg p-3" key={fulfillment.id}>
                  <div className="flex items-center justify-between gap-2">
                    <Text size="small" weight="plus">{fulfillment.id}</Text>
                    <Badge color={fulfillment.canceled_at ? "red" : fulfillment.delivered_at || fulfillment.shipped_at ? "green" : "blue"}>
                      {fulfillment.canceled_at
                        ? "canceled"
                        : fulfillment.delivered_at
                          ? "delivered"
                          : fulfillment.shipped_at
                            ? "shipped"
                            : fulfillment.status || "created"}
                    </Badge>
                  </div>
                  <Text size="small" className="text-ui-fg-subtle">
                    {fulfillment.items?.reduce((total, item) => total + Number(item.quantity), 0) ?? 0} item(s)
                    {fulfillment.location_id ? ` · ${fulfillment.location_id}` : ""}
                  </Text>
                  {(fulfillment.labels ?? []).map((label) => (
                    <div key={label.id} className="flex flex-col gap-y-1">
                      <Text size="small" className="text-ui-fg-subtle">
                        Tracking: {label.tracking_url ? (
                          <a className="text-ui-fg-interactive" href={label.tracking_url} target="_blank" rel="noreferrer">
                            {label.tracking_number || "View tracking"}
                          </a>
                        ) : label.tracking_number || "Not available"}
                      </Text>
                      {label.label_url && (
                        <Text size="small" className="text-ui-fg-subtle">
                          <a className="text-ui-fg-interactive" href={label.label_url} target="_blank" rel="noreferrer">
                            View shipping label
                          </a>
                        </Text>
                      )}
                    </div>
                  ))}
                  {canManage && !fulfillment.shipped_at && !fulfillment.canceled_at && (
                    <Button size="small" variant="secondary" onClick={() => {
                      setShipFulfillmentId(fulfillment.id)
                      setAction("ship")
                    }}>
                      <TruckFast /> Create shipment
                    </Button>
                  )}
                  {canManage && fulfillment.shipped_at && !fulfillment.delivered_at && !fulfillment.canceled_at && (
                    <Button
                      size="small"
                      variant="secondary"
                      disabled={deliverFulfillment.isPending}
                      onClick={() => {
                        setDeliveryFulfillmentId(fulfillment.id)
                        setSendDeliveryNotification(!order.no_notification)
                        setDeliveryPromptOpen(true)
                      }}
                    >
                      <CheckCircle /> Mark as delivered
                    </Button>
                  )}
                </div>
              )) : <Text size="small" className="text-ui-fg-subtle">Not fulfilled</Text>}
            </div>
          </Container>
          <AddressCard title="Shipping address" address={order.shipping_address} />
          <AddressCard title="Billing address" address={order.billing_address} />
        </div>
      </div>
      <FulfillItemsDrawer
        open={action === "fulfill"}
        order={order}
        session={session}
        onClose={() => setAction(null)}
      />
      <OrderActionDrawer
        action={action}
        order={order}
        session={session}
        initialFulfillmentId={shipFulfillmentId}
        onClose={() => setAction(null)}
      />
      <Prompt
        open={deliveryPromptOpen}
        onOpenChange={(open) => {
          if (!deliverFulfillment.isPending) {
            setDeliveryPromptOpen(open)
          }
        }}
        variant="confirmation"
      >
        <Prompt.Content>
          <Prompt.Header>
            <Prompt.Title>Mark fulfillment as delivered?</Prompt.Title>
            <Prompt.Description>
              This records delivery for the fulfilled items. When every
              fulfillment is delivered, the order fulfillment status becomes
              delivered.
            </Prompt.Description>
          </Prompt.Header>
          <div className="border-ui-border-base mt-6 flex items-center justify-between border-y border-dotted p-6">
            <Label
              htmlFor="send-delivery-notification"
              className="text-ui-fg-subtle"
            >
              Send notification
            </Label>
            <Switch
              id="send-delivery-notification"
              checked={sendDeliveryNotification}
              onCheckedChange={setSendDeliveryNotification}
            />
          </div>
          <Prompt.Footer>
            <Prompt.Cancel disabled={deliverFulfillment.isPending}>
              Cancel
            </Prompt.Cancel>
            <Prompt.Action
              disabled={
                deliverFulfillment.isPending || !deliveryFulfillmentId
              }
              onClick={(event) => {
                event.preventDefault()
                if (deliveryFulfillmentId) {
                  deliverFulfillment.mutate({
                    fulfillmentId: deliveryFulfillmentId,
                    noNotification: !sendDeliveryNotification,
                  })
                }
              }}
            >
              {deliverFulfillment.isPending && (
                <Spinner className="animate-spin" />
              )}
              Mark as delivered
            </Prompt.Action>
          </Prompt.Footer>
        </Prompt.Content>
      </Prompt>
    </div>
  )
}

const MerchantOrderDetailsPage = () => (
  <MerchantRoute>{(session) => <OrderDetailsContent session={session} />}</MerchantRoute>
)

export const handle = { breadcrumb: () => "Order details" }

export default MerchantOrderDetailsPage
