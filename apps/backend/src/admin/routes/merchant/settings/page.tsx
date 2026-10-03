import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Globe, Plus } from "@medusajs/icons"
import {
  Alert,
  Button,
  Container,
  Drawer,
  Heading,
  Input,
  Label,
  Select,
  StatusBadge,
  Switch,
  Table,
  Tabs,
  Text,
  toast,
} from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { FormEvent, ReactNode, useState } from "react"

import {
  MerchantPageHeader,
  MerchantPageSkeleton,
  MerchantRoute,
  statusColor,
} from "../../../components/merchant/merchant-page"
import {
  canManageMerchant,
  errorMessage,
  formatMoney,
  merchantApi,
  merchantQueryKeys,
  type MerchantDashboard,
  type MerchantDeliveryMethod,
  type MerchantDeliverySettings,
  type MerchantPaymentConfig,
  type MerchantSession,
} from "../../../lib/merchant-api"

const SettingsSection = ({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) => (
  <Container className="divide-y p-0">
    <div className="px-6 py-4">
      <Heading level="h2">{title}</Heading>
      <Text size="small" className="text-ui-fg-subtle">
        {description}
      </Text>
    </div>
    <div className="p-6">{children}</div>
  </Container>
)

const BusinessSettings = ({
  session,
  merchant,
  canManage,
}: {
  session: MerchantSession
  merchant: MerchantDashboard
  canManage: boolean
}) => {
  const queryClient = useQueryClient()
  const updateMerchant = useMutation({
    mutationFn: (name: string) =>
      merchantApi.post(session.merchant.id, "", { name }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: merchantQueryKeys.dashboard(session.merchant.id),
        }),
        queryClient.invalidateQueries({
          queryKey: merchantQueryKeys.session,
        }),
      ])
      toast.success("Store details updated")
    },
    onError: (error) => toast.error(errorMessage(error)),
  })
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    updateMerchant.mutate(String(formData.get("name") ?? "").trim())
  }

  return (
    <div className="flex flex-col gap-y-3">
      <SettingsSection
        title="Store details"
        description="The public identity of this merchant storefront"
      >
        <form
          className="flex max-w-xl flex-col gap-y-4"
          onSubmit={handleSubmit}
        >
          <div className="flex flex-col gap-y-2">
            <Label htmlFor="merchant-name">Store name</Label>
            <Input
              id="merchant-name"
              name="name"
              defaultValue={merchant.name}
              disabled={!canManage}
              required
            />
          </div>
          <div className="flex flex-col gap-y-2">
            <Label htmlFor="merchant-slug">Permanent slug</Label>
            <Input id="merchant-slug" value={merchant.slug} disabled readOnly />
            <Text size="xsmall" className="text-ui-fg-subtle">
              The platform controls this stable tenant identifier.
            </Text>
          </div>
          {canManage && (
            <div>
              <Button type="submit" isLoading={updateMerchant.isPending}>
                Save changes
              </Button>
            </div>
          )}
        </form>
      </SettingsSection>

      <SettingsSection
        title="Account access"
        description="Your current membership in this merchant"
      >
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <Text size="small" className="text-ui-fg-subtle">
              Role
            </Text>
            <Text weight="plus">{session.member.role}</Text>
          </div>
          <div>
            <Text size="small" className="text-ui-fg-subtle">
              Status
            </Text>
            <StatusBadge color="green">{session.member.status}</StatusBadge>
          </div>
          <div>
            <Text size="small" className="text-ui-fg-subtle">
              Merchant ID
            </Text>
            <Text className="font-mono" size="small">
              {session.merchant.id}
            </Text>
          </div>
          <div>
            <Text size="small" className="text-ui-fg-subtle">
              Sales channel
            </Text>
            <Text weight="plus">
              {session.merchant.primary_sales_channel?.name || "—"}
            </Text>
          </div>
        </dl>
      </SettingsSection>
    </div>
  )
}

const BrandingSettings = ({
  session,
  merchant,
  canManage,
}: {
  session: MerchantSession
  merchant: MerchantDashboard
  canManage: boolean
}) => {
  const queryClient = useQueryClient()
  const activeTheme = merchant.themes?.find((theme) => theme.is_active)
  const branding = activeTheme?.configuration.branding
  const publishTheme = useMutation({
    mutationFn: (configuration: Record<string, unknown>) =>
      merchantApi.post(session.merchant.id, "/theme", { configuration }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: merchantQueryKeys.dashboard(session.merchant.id),
      })
      toast.success("Storefront theme published")
    },
    onError: (error) => toast.error(errorMessage(error)),
  })
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)

    publishTheme.mutate({
      ...(activeTheme?.configuration ?? {}),
      branding: {
        ...(branding ?? {}),
        name: String(formData.get("branding_name") ?? "").trim(),
        primary_color: String(formData.get("primary_color") ?? ""),
        accent_color: String(formData.get("accent_color") ?? ""),
      },
      pages: activeTheme?.configuration.pages ?? [],
    })
  }

  return (
    <SettingsSection
      title="Branding"
      description="Publish colors and naming used by the merchant storefront"
    >
      <form className="flex max-w-xl flex-col gap-y-4" onSubmit={handleSubmit}>
        <div className="flex flex-col gap-y-2">
          <Label htmlFor="branding-name">Brand name</Label>
          <Input
            id="branding-name"
            name="branding_name"
            defaultValue={branding?.name || merchant.name}
            disabled={!canManage}
            required
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-y-2">
            <Label htmlFor="primary-color">Primary color</Label>
            <div className="flex gap-x-2">
              <Input
                className="w-14 p-1"
                id="primary-color-picker"
                type="color"
                defaultValue={branding?.primary_color || "#111827"}
                disabled={!canManage}
                onChange={(event) => {
                  const input = document.getElementById(
                    "primary-color",
                  ) as HTMLInputElement | null
                  if (input) input.value = event.target.value
                }}
              />
              <Input
                id="primary-color"
                name="primary_color"
                defaultValue={branding?.primary_color || "#111827"}
                pattern="#[0-9A-Fa-f]{6}"
                disabled={!canManage}
                required
              />
            </div>
          </div>
          <div className="flex flex-col gap-y-2">
            <Label htmlFor="accent-color">Accent color</Label>
            <div className="flex gap-x-2">
              <Input
                className="w-14 p-1"
                id="accent-color-picker"
                type="color"
                defaultValue={branding?.accent_color || "#2563eb"}
                disabled={!canManage}
                onChange={(event) => {
                  const input = document.getElementById(
                    "accent-color",
                  ) as HTMLInputElement | null
                  if (input) input.value = event.target.value
                }}
              />
              <Input
                id="accent-color"
                name="accent_color"
                defaultValue={branding?.accent_color || "#2563eb"}
                pattern="#[0-9A-Fa-f]{6}"
                disabled={!canManage}
                required
              />
            </div>
          </div>
        </div>
        {canManage && (
          <div>
            <Button type="submit" isLoading={publishTheme.isPending}>
              Publish theme
            </Button>
          </div>
        )}
      </form>
    </SettingsSection>
  )
}

const DomainSettings = ({
  session,
  merchant,
  canManage,
}: {
  session: MerchantSession
  merchant: MerchantDashboard
  canManage: boolean
}) => {
  const queryClient = useQueryClient()
  const [verification, setVerification] = useState<{
    hostname: string
    token: string
  } | null>(null)
  const addDomain = useMutation({
    mutationFn: (hostname: string) =>
      merchantApi.post<{ verification_token: string }>(
        session.merchant.id,
        "/domains",
        { hostname },
      ),
    onSuccess: async (response, hostname) => {
      setVerification({ hostname, token: response.verification_token })
      await queryClient.invalidateQueries({
        queryKey: merchantQueryKeys.dashboard(session.merchant.id),
      })
      toast.success("Domain added")
    },
    onError: (error) => toast.error(errorMessage(error)),
  })
  const verifyDomain = useMutation({
    mutationFn: (domainId: string) =>
      merchantApi.post(session.merchant.id, `/domains/${domainId}/verify`, {}),
    onSuccess: async () => {
      setVerification(null)
      await queryClient.invalidateQueries({
        queryKey: merchantQueryKeys.dashboard(session.merchant.id),
      })
      toast.success("Domain verified")
    },
    onError: (error) => toast.error(errorMessage(error)),
  })
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    addDomain.mutate(String(formData.get("hostname") ?? "").trim())
  }

  return (
    <SettingsSection
      title="Domains"
      description="Hostnames connected to this merchant storefront"
    >
      <div className="flex flex-col gap-y-5">
        {canManage && (
          <form className="flex max-w-xl gap-x-2" onSubmit={handleSubmit}>
            <Input name="hostname" placeholder="shop.example.com" required />
            <Button type="submit" isLoading={addDomain.isPending}>
              <Globe />
              Add domain
            </Button>
          </form>
        )}
        {verification && (
          <Alert>
            Add the DNS TXT record `_merchant-verification.
            {verification.hostname}` with value `{verification.token}`. This
            token is shown only once.
          </Alert>
        )}
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Hostname</Table.HeaderCell>
              <Table.HeaderCell>Type</Table.HeaderCell>
              <Table.HeaderCell>Status</Table.HeaderCell>
              <Table.HeaderCell />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {(merchant.domains ?? []).map((domain) => (
              <Table.Row key={domain.id}>
                <Table.Cell>{domain.hostname}</Table.Cell>
                <Table.Cell>{domain.type}</Table.Cell>
                <Table.Cell>
                  <StatusBadge color={statusColor(domain.status)}>
                    {domain.status}
                  </StatusBadge>
                </Table.Cell>
                <Table.Cell className="text-right">
                  {canManage &&
                    domain.type === "custom" &&
                    domain.status !== "active" && (
                      <Button
                        size="small"
                        variant="secondary"
                        isLoading={
                          verifyDomain.isPending &&
                          verifyDomain.variables === domain.id
                        }
                        onClick={() => verifyDomain.mutate(domain.id)}
                      >
                        Verify
                      </Button>
                    )}
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      </div>
    </SettingsSection>
  )
}

const PaymentSettings = ({
  session,
  payment,
  canManage,
}: {
  session: MerchantSession
  payment?: MerchantPaymentConfig
  canManage: boolean
}) => {
  const [provider, setProvider] = useState(payment?.provider ?? "mpesa_stk")
  const [mode, setMode] = useState(payment?.mode ?? "sandbox")
  const [status, setStatus] = useState(payment?.status ?? "disabled")
  const queryClient = useQueryClient()
  const updatePayment = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      merchantApi.post(session.merchant.id, "/payments", body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: merchantQueryKeys.dashboard(session.merchant.id),
      })
      toast.success("Payment configuration saved")
    },
    onError: (error) => toast.error(errorMessage(error)),
  })
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const secretReference = String(
      formData.get("secret_reference") ?? "",
    ).trim()

    updatePayment.mutate({
      provider,
      mode,
      status,
      public_configuration: {
        shortcode: String(formData.get("shortcode") ?? "").trim(),
        account_reference: String(
          formData.get("account_reference") ?? "",
        ).trim(),
      },
      secret_reference: secretReference || null,
    })
  }
  const publicConfiguration = payment?.public_configuration ?? {}

  return (
    <SettingsSection
      title="M-Pesa payments"
      description="Public checkout settings and a reference to managed credentials"
    >
      <form className="flex max-w-2xl flex-col gap-y-4" onSubmit={handleSubmit}>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-y-2">
            <Label>Provider</Label>
            <Select
              value={provider}
              onValueChange={(value) =>
                setProvider(value as "mpesa_stk" | "mpesa_paybill")
              }
              disabled={!canManage}
            >
              <Select.Trigger>
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="mpesa_stk">STK Push</Select.Item>
                <Select.Item value="mpesa_paybill">Paybill</Select.Item>
              </Select.Content>
            </Select>
          </div>
          <div className="flex flex-col gap-y-2">
            <Label>Mode</Label>
            <Select
              value={mode}
              onValueChange={(value) =>
                setMode(value as "sandbox" | "production")
              }
              disabled={!canManage}
            >
              <Select.Trigger>
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="sandbox">Sandbox</Select.Item>
                <Select.Item value="production">Production</Select.Item>
              </Select.Content>
            </Select>
          </div>
          <div className="flex flex-col gap-y-2">
            <Label>Status</Label>
            <Select
              value={status}
              onValueChange={(value) =>
                setStatus(value as "disabled" | "active")
              }
              disabled={!canManage}
            >
              <Select.Trigger>
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="disabled">Disabled</Select.Item>
                <Select.Item value="active">Active</Select.Item>
              </Select.Content>
            </Select>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-y-2">
            <Label htmlFor="shortcode">Shortcode</Label>
            <Input
              id="shortcode"
              name="shortcode"
              defaultValue={String(publicConfiguration.shortcode ?? "")}
              disabled={!canManage}
              required
            />
          </div>
          <div className="flex flex-col gap-y-2">
            <Label htmlFor="account-reference">Account reference</Label>
            <Input
              id="account-reference"
              name="account_reference"
              defaultValue={String(publicConfiguration.account_reference ?? "")}
              disabled={!canManage}
              required
            />
          </div>
        </div>
        <div className="flex flex-col gap-y-2">
          <Label htmlFor="secret-reference">Secret-manager reference</Label>
          <Input
            id="secret-reference"
            name="secret_reference"
            placeholder="secrets/merchants/store/mpesa"
            disabled={!canManage}
          />
          <Text size="xsmall" className="text-ui-fg-subtle">
            Credentials are not stored in merchant records or returned to the
            browser.
          </Text>
        </div>
        {canManage && (
          <div>
            <Button type="submit" isLoading={updatePayment.isPending}>
              Save payment settings
            </Button>
          </div>
        )}
      </form>
    </SettingsSection>
  )
}

const CreateLocationDrawer = ({
  open,
  session,
  onClose,
}: {
  open: boolean
  session: MerchantSession
  onClose: () => void
}) => {
  const queryClient = useQueryClient()
  const createLocation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      merchantApi.post(session.merchant.id, "/inventory/locations", body),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: merchantQueryKeys.resource(
            session.merchant.id,
            "delivery-options",
          ),
        }),
        queryClient.invalidateQueries({
          queryKey: merchantQueryKeys.resource(
            session.merchant.id,
            "inventory",
          ),
        }),
      ])
      toast.success("Stock location created")
      onClose()
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
            address_2:
              String(formData.get("address_2") ?? "").trim() || undefined,
            city: String(formData.get("city") ?? "").trim(),
            province:
              String(formData.get("province") ?? "").trim() || undefined,
            postal_code:
              String(formData.get("postal_code") ?? "").trim() || undefined,
            country_code: String(formData.get("country_code") ?? "")
              .trim()
              .toLowerCase(),
          },
        },
      ],
    })
  }

  return (
    <Drawer open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <Drawer.Content>
        <form className="flex h-full flex-col" onSubmit={handleSubmit}>
          <Drawer.Header>
            <Drawer.Title>Add stock location</Drawer.Title>
            <Drawer.Description>
              Delivery methods use this address as their fulfillment origin.
            </Drawer.Description>
          </Drawer.Header>
          <Drawer.Body className="flex flex-1 flex-col gap-y-4">
            <div className="flex flex-col gap-y-2">
              <Label htmlFor="settings-location-name">Location name</Label>
              <Input id="settings-location-name" name="name" required />
            </div>
            <div className="flex flex-col gap-y-2">
              <Label htmlFor="settings-location-address-1">Address</Label>
              <Input
                id="settings-location-address-1"
                name="address_1"
                required
              />
            </div>
            <div className="flex flex-col gap-y-2">
              <Label htmlFor="settings-location-address-2">
                Address line 2
              </Label>
              <Input id="settings-location-address-2" name="address_2" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-y-2">
                <Label htmlFor="settings-location-city">City</Label>
                <Input id="settings-location-city" name="city" required />
              </div>
              <div className="flex flex-col gap-y-2">
                <Label htmlFor="settings-location-province">
                  County / state
                </Label>
                <Input id="settings-location-province" name="province" />
              </div>
              <div className="flex flex-col gap-y-2">
                <Label htmlFor="settings-location-postal">Postal code</Label>
                <Input id="settings-location-postal" name="postal_code" />
              </div>
              <div className="flex flex-col gap-y-2">
                <Label htmlFor="settings-location-country">Country code</Label>
                <Input
                  id="settings-location-country"
                  name="country_code"
                  defaultValue="ke"
                  maxLength={2}
                  pattern="[A-Za-z]{2}"
                  required
                />
              </div>
            </div>
          </Drawer.Body>
          <Drawer.Footer>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" isLoading={createLocation.isPending}>
              Create location
            </Button>
          </Drawer.Footer>
        </form>
      </Drawer.Content>
    </Drawer>
  )
}

const DeliveryMethodDrawer = ({
  open,
  session,
  settings,
  method,
  onClose,
}: {
  open: boolean
  session: MerchantSession
  settings: MerchantDeliverySettings
  method: MerchantDeliveryMethod | null
  onClose: () => void
}) => {
  const regionCountryCodes = Array.from(
    new Set(settings.regions.flatMap(({ country_codes }) => country_codes)),
  )
  const defaultCountryCode = regionCountryCodes.includes("dk")
    ? "dk"
    : (regionCountryCodes[0] ??
      settings.stock_locations[0]?.address?.country_code ??
      "ke")
  const defaultCurrencyCode =
    settings.regions.find(({ country_codes }) => {
      return country_codes.includes(defaultCountryCode)
    })?.currency_code ??
    settings.regions[0]?.currency_code ??
    "kes"
  const [locationId, setLocationId] = useState(
    method?.stock_location.id ?? settings.stock_locations[0]?.id ?? "",
  )
  const [shippingProfileId, setShippingProfileId] = useState(
    method?.shipping_profile.id ?? settings.shipping_profiles[0]?.id ?? "",
  )
  const [isEnabled, setIsEnabled] = useState(method?.is_enabled ?? true)
  const [isDefault, setIsDefault] = useState(method?.is_default ?? false)
  const queryClient = useQueryClient()
  const saveMethod = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      merchantApi.post(
        session.merchant.id,
        method ? `/delivery-options/${method.id}` : "/delivery-options",
        body,
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: merchantQueryKeys.resource(
          session.merchant.id,
          "delivery-options",
        ),
      })
      toast.success(
        method ? "Delivery method updated" : "Delivery method created",
      )
      onClose()
    },
    onError: (error) => toast.error(errorMessage(error)),
  })
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const countryCodes = Array.from(
      new Set(
        String(formData.get("country_codes") ?? "")
          .split(/[\s,]+/)
          .map((countryCode) => countryCode.trim().toLowerCase())
          .filter(Boolean),
      ),
    )

    saveMethod.mutate({
      name: String(formData.get("name") ?? "").trim(),
      description: String(formData.get("description") ?? "").trim() || null,
      estimated_delivery:
        String(formData.get("estimated_delivery") ?? "").trim() || null,
      stock_location_id: locationId,
      shipping_profile_id: shippingProfileId,
      country_codes: countryCodes,
      price: {
        amount: Number(formData.get("amount") ?? 0),
        currency_code: String(formData.get("currency_code") ?? "")
          .trim()
          .toLowerCase(),
      },
      is_enabled: isEnabled,
      is_default: isDefault,
    })
  }

  return (
    <Drawer open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <Drawer.Content>
        <form className="flex h-full flex-col" onSubmit={handleSubmit}>
          <Drawer.Header>
            <Drawer.Title>
              {method ? "Edit delivery method" : "Add delivery method"}
            </Drawer.Title>
            <Drawer.Description>
              Configure a customer-facing option that can appear at checkout.
            </Drawer.Description>
          </Drawer.Header>
          <Drawer.Body className="flex flex-1 flex-col gap-y-5">
            <div className="flex flex-col gap-y-2">
              <Label htmlFor="delivery-name">Name</Label>
              <Input
                id="delivery-name"
                name="name"
                defaultValue={method?.name ?? ""}
                placeholder="Standard delivery"
                required
              />
            </div>
            <div className="flex flex-col gap-y-2">
              <Label htmlFor="delivery-description">Description</Label>
              <Input
                id="delivery-description"
                name="description"
                defaultValue={method?.description ?? ""}
                placeholder="Door-to-door delivery"
              />
            </div>
            <div className="flex flex-col gap-y-2">
              <Label htmlFor="delivery-estimate">Delivery estimate</Label>
              <Input
                id="delivery-estimate"
                name="estimated_delivery"
                defaultValue={method?.estimated_delivery ?? ""}
                placeholder="2-3 business days"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-y-2">
                <Label>Fulfillment location</Label>
                <Select value={locationId} onValueChange={setLocationId}>
                  <Select.Trigger>
                    <Select.Value placeholder="Select a location" />
                  </Select.Trigger>
                  <Select.Content>
                    {settings.stock_locations.map((location) => (
                      <Select.Item key={location.id} value={location.id}>
                        {location.name}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select>
              </div>
              <div className="flex flex-col gap-y-2">
                <Label>Shipping profile</Label>
                <Select
                  value={shippingProfileId}
                  onValueChange={setShippingProfileId}
                >
                  <Select.Trigger>
                    <Select.Value placeholder="Select a profile" />
                  </Select.Trigger>
                  <Select.Content>
                    {settings.shipping_profiles.map((profile) => (
                      <Select.Item key={profile.id} value={profile.id}>
                        {profile.name}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select>
              </div>
            </div>
            <div className="flex flex-col gap-y-2">
              <Label htmlFor="delivery-countries">Destination countries</Label>
              <Input
                id="delivery-countries"
                name="country_codes"
                defaultValue={
                  method?.service_zone.country_codes.join(", ") ??
                  defaultCountryCode
                }
                placeholder="ke, ug, tz"
                required
              />
              <Text size="xsmall" className="text-ui-fg-subtle">
                Enter two-letter country codes separated by commas.
                {regionCountryCodes.length > 0 && (
                  <>
                    {" "}
                    Available in checkout:{" "}
                    {regionCountryCodes
                      .map((countryCode) => countryCode.toUpperCase())
                      .join(", ")}
                    .
                  </>
                )}
              </Text>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-y-2">
                <Label htmlFor="delivery-price">Price</Label>
                <Input
                  id="delivery-price"
                  name="amount"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={method?.price?.amount ?? 0}
                  required
                />
              </div>
              <div className="flex flex-col gap-y-2">
                <Label htmlFor="delivery-currency">Currency</Label>
                <Input
                  id="delivery-currency"
                  name="currency_code"
                  defaultValue={
                    method?.price?.currency_code ?? defaultCurrencyCode
                  }
                  maxLength={3}
                  pattern="[A-Za-z]{3}"
                  required
                />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <Text weight="plus">Available at checkout</Text>
                <Text size="xsmall" className="text-ui-fg-subtle">
                  Disabled methods remain saved but cannot be selected.
                </Text>
              </div>
              <Switch checked={isEnabled} onCheckedChange={setIsEnabled} />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <Text weight="plus">Default method</Text>
                <Text size="xsmall" className="text-ui-fg-subtle">
                  Making this default clears the previous default.
                </Text>
              </div>
              <Switch checked={isDefault} onCheckedChange={setIsDefault} />
            </div>
          </Drawer.Body>
          <Drawer.Footer>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              isLoading={saveMethod.isPending}
              disabled={!locationId || !shippingProfileId}
            >
              {method ? "Save changes" : "Create method"}
            </Button>
          </Drawer.Footer>
        </form>
      </Drawer.Content>
    </Drawer>
  )
}

const LocationsAndShippingSettings = ({
  session,
  canManage,
}: {
  session: MerchantSession
  canManage: boolean
}) => {
  const [locationDrawerOpen, setLocationDrawerOpen] = useState(false)
  const [deliveryDrawerOpen, setDeliveryDrawerOpen] = useState(false)
  const [selectedMethod, setSelectedMethod] =
    useState<MerchantDeliveryMethod | null>(null)
  const deliveryQuery = useQuery({
    queryKey: merchantQueryKeys.resource(
      session.merchant.id,
      "delivery-options",
    ),
    queryFn: () =>
      merchantApi.get<MerchantDeliverySettings>(
        session.merchant.id,
        "/delivery-options",
      ),
  })

  if (deliveryQuery.isError) {
    throw deliveryQuery.error
  }

  if (deliveryQuery.isPending || !deliveryQuery.data) {
    return <MerchantPageSkeleton />
  }

  const settings = deliveryQuery.data
  const canAddDeliveryMethod =
    canManage &&
    settings.stock_locations.length > 0 &&
    settings.shipping_profiles.length > 0
  const closeDeliveryDrawer = () => {
    setDeliveryDrawerOpen(false)
    setSelectedMethod(null)
  }

  return (
    <>
      <div className="flex flex-col gap-y-3">
        <SettingsSection
          title="Stock locations"
          description="Addresses used to stock and fulfill this merchant's products"
        >
          <div className="flex flex-col gap-y-4">
            {canManage && (
              <div>
                <Button
                  size="small"
                  variant="secondary"
                  onClick={() => setLocationDrawerOpen(true)}
                >
                  <Plus />
                  Add location
                </Button>
              </div>
            )}
            {settings.stock_locations.length ? (
              <Table>
                <Table.Header>
                  <Table.Row>
                    <Table.HeaderCell>Location</Table.HeaderCell>
                    <Table.HeaderCell>Address</Table.HeaderCell>
                    <Table.HeaderCell>Country</Table.HeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {settings.stock_locations.map((location) => (
                    <Table.Row key={location.id}>
                      <Table.Cell>
                        <Text weight="plus">{location.name}</Text>
                      </Table.Cell>
                      <Table.Cell>
                        {[location.address?.address_1, location.address?.city]
                          .filter(Boolean)
                          .join(", ") || "Not set"}
                      </Table.Cell>
                      <Table.Cell>
                        {location.address?.country_code?.toUpperCase() ||
                          "Not set"}
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table>
            ) : (
              <Alert>
                Add a stock location before creating a delivery method.
              </Alert>
            )}
          </div>
        </SettingsSection>

        <SettingsSection
          title="Delivery methods"
          description="Customer-facing delivery choices shown when the destination, currency, inventory, and shipping profile are eligible"
        >
          <div className="flex flex-col gap-y-4">
            <div className="flex items-center justify-between gap-x-4">
              <Text size="small" className="text-ui-fg-subtle">
                You can create Standard, Express, Pickup, or any other method.
              </Text>
              {canManage && (
                <Button
                  size="small"
                  onClick={() => {
                    setSelectedMethod(null)
                    setDeliveryDrawerOpen(true)
                  }}
                  disabled={!canAddDeliveryMethod}
                >
                  <Plus />
                  Add delivery method
                </Button>
              )}
            </div>
            {!settings.shipping_profiles.length && (
              <Alert>
                Create a shipping profile in Catalog before adding a delivery
                method.
              </Alert>
            )}
            {settings.delivery_options.length ? (
              <Table>
                <Table.Header>
                  <Table.Row>
                    <Table.HeaderCell>Method</Table.HeaderCell>
                    <Table.HeaderCell>Destinations</Table.HeaderCell>
                    <Table.HeaderCell>Price</Table.HeaderCell>
                    <Table.HeaderCell>Location</Table.HeaderCell>
                    <Table.HeaderCell>Status</Table.HeaderCell>
                    <Table.HeaderCell />
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {settings.delivery_options.map((method) => (
                    <Table.Row key={method.id}>
                      <Table.Cell>
                        <div className="flex flex-col">
                          <div className="flex items-center gap-x-2">
                            <Text weight="plus">{method.name}</Text>
                            {method.is_default && (
                              <StatusBadge color="blue">Default</StatusBadge>
                            )}
                          </div>
                          <Text size="xsmall" className="text-ui-fg-subtle">
                            {method.estimated_delivery ||
                              method.description ||
                              "No estimate"}
                          </Text>
                        </div>
                      </Table.Cell>
                      <Table.Cell>
                        {method.service_zone.country_codes
                          .map((countryCode) => countryCode.toUpperCase())
                          .join(", ")}
                      </Table.Cell>
                      <Table.Cell>
                        {method.price
                          ? formatMoney(
                              method.price.amount,
                              method.price.currency_code,
                            )
                          : "No price"}
                      </Table.Cell>
                      <Table.Cell>{method.stock_location.name}</Table.Cell>
                      <Table.Cell>
                        <StatusBadge
                          color={method.is_enabled ? "green" : "grey"}
                        >
                          {method.is_enabled ? "Enabled" : "Disabled"}
                        </StatusBadge>
                      </Table.Cell>
                      <Table.Cell className="text-right">
                        {canManage && (
                          <Button
                            size="small"
                            variant="secondary"
                            onClick={() => {
                              setSelectedMethod(method)
                              setDeliveryDrawerOpen(true)
                            }}
                          >
                            Edit
                          </Button>
                        )}
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table>
            ) : (
              <Alert>
                No delivery methods are configured. Checkout cannot continue to
                payment until an eligible method exists and is selected.
              </Alert>
            )}
          </div>
        </SettingsSection>
      </div>
      <CreateLocationDrawer
        open={locationDrawerOpen}
        session={session}
        onClose={() => setLocationDrawerOpen(false)}
      />
      <DeliveryMethodDrawer
        key={selectedMethod?.id ?? "new-delivery-method"}
        open={deliveryDrawerOpen}
        session={session}
        settings={settings}
        method={selectedMethod}
        onClose={closeDeliveryDrawer}
      />
    </>
  )
}

const MerchantSettingsContent = ({ session }: { session: MerchantSession }) => {
  const dashboardQuery = useQuery({
    queryKey: merchantQueryKeys.dashboard(session.merchant.id),
    queryFn: () => merchantApi.dashboard(session.merchant.id),
  })
  const canManage = canManageMerchant(session.member.role)

  if (dashboardQuery.isPending) {
    return <MerchantPageSkeleton />
  }

  if (dashboardQuery.isError || !dashboardQuery.data) {
    throw dashboardQuery.error
  }

  const merchant = dashboardQuery.data

  return (
    <div className="flex flex-col gap-y-3">
      <Container className="p-0">
        <MerchantPageHeader
          title="Settings"
          subtitle={`Configuration for ${merchant.name}`}
        />
      </Container>
      <Tabs defaultValue="business">
        <Container className="p-0">
          <Tabs.List>
            <Tabs.Trigger value="business">Business</Tabs.Trigger>
            <Tabs.Trigger value="branding">Branding</Tabs.Trigger>
            <Tabs.Trigger value="domains">Domains</Tabs.Trigger>
            <Tabs.Trigger value="payments">Payments</Tabs.Trigger>
            <Tabs.Trigger value="locations-shipping">
              Locations &amp; shipping
            </Tabs.Trigger>
          </Tabs.List>
        </Container>
        <Tabs.Content value="business" className="mt-3">
          <BusinessSettings
            session={session}
            merchant={merchant}
            canManage={canManage}
          />
        </Tabs.Content>
        <Tabs.Content value="branding" className="mt-3">
          <BrandingSettings
            session={session}
            merchant={merchant}
            canManage={canManage}
          />
        </Tabs.Content>
        <Tabs.Content value="domains" className="mt-3">
          <DomainSettings
            session={session}
            merchant={merchant}
            canManage={canManage}
          />
        </Tabs.Content>
        <Tabs.Content value="payments" className="mt-3">
          <PaymentSettings
            session={session}
            payment={merchant.payment_configs?.[0]}
            canManage={canManage}
          />
        </Tabs.Content>
        <Tabs.Content value="locations-shipping" className="mt-3">
          <LocationsAndShippingSettings
            session={session}
            canManage={canManage}
          />
        </Tabs.Content>
      </Tabs>
    </div>
  )
}

const MerchantSettingsPage = () => {
  return (
    <MerchantRoute>
      {(session) => <MerchantSettingsContent session={session} />}
    </MerchantRoute>
  )
}

export const config = defineRouteConfig({})

export const handle = {
  breadcrumb: () => "Settings",
}

export default MerchantSettingsPage
