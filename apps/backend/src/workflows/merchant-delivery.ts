import type { MedusaContainer } from "@medusajs/framework"
import type {
  FulfillmentTypes,
  FulfillmentWorkflow,
} from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  generateEntityId,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils"
import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import {
  createFulfillmentSets,
  createServiceZonesWorkflow,
  createShippingOptionsWorkflow,
  updateServiceZonesWorkflow,
  updateShippingOptionsWorkflow,
  updateShippingOptionTypesWorkflow,
} from "@medusajs/medusa/core-flows"

import type { ResolvedMerchantId } from "../services/tenant-resolution"
import { assertMerchantOwns } from "../services/tenant-resolution"
import {
  type MerchantScopeInput,
  validateMerchantScopeStep,
} from "./steps/validate-merchant-commerce"

const manualFulfillmentProviderId = "manual_manual"

export type MerchantDeliveryMethodInput = MerchantScopeInput & {
  name: string
  description?: string | null
  estimated_delivery?: string | null
  stock_location_id: string
  shipping_profile_id: string
  country_codes: string[]
  price: {
    amount: number
    currency_code: string
  }
  is_enabled: boolean
  is_default: boolean
}

export type UpdateMerchantDeliveryMethodInput =
  MerchantDeliveryMethodInput & {
    delivery_option_id: string
  }

type DeliveryOptionData = Record<string, unknown> & {
  merchant_delivery?: boolean
  merchant_id?: string
  estimated_delivery?: string | null
  is_enabled?: boolean
  is_default?: boolean
}

type DeliveryGraph = {
  id: string
  name: string
  price_type: string
  service_zone_id: string
  shipping_profile_id: string
  data?: DeliveryOptionData | null
  type?: {
    id: string
    label: string
    description?: string | null
    code: string
  } | null
  rules?: Array<{
    id: string
    attribute: string
    operator: string
    value: string | string[]
  }>
  prices?: Array<{
    id: string
    amount: number
    currency_code?: string | null
    region_id?: string | null
  }>
  created_at?: string
  updated_at?: string
}

type ServiceZoneGraph = {
  id: string
  name: string
  fulfillment_set_id: string
  geo_zones?: Array<{
    id: string
    type: string
    country_code: string
  }>
}

type LocationFulfillmentSetGraph = {
  stock_location_id: string
  fulfillment_set_id: string
}

type MerchantDeliveryResourcesGraph = {
  stock_locations?: Array<{
    id: string
    name: string
    address?: Record<string, unknown> | null
  }>
  shipping_profiles?: Array<{
    id: string
    name: string
    type: string
  }>
}

export type MerchantDeliveryMethod = {
  id: string
  name: string
  description: string | null
  estimated_delivery: string | null
  is_enabled: boolean
  is_default: boolean
  stock_location: {
    id: string
    name: string
  }
  shipping_profile: {
    id: string
    name: string
    type: string
  }
  service_zone: {
    id: string
    name: string
    fulfillment_set_id: string
    country_codes: string[]
  }
  price: {
    id: string
    amount: number
    currency_code: string
  } | null
  created_at?: string
  updated_at?: string
}

type MerchantDeliveryResources = {
  stock_locations: NonNullable<
    MerchantDeliveryResourcesGraph["stock_locations"]
  >
  shipping_profiles: NonNullable<
    MerchantDeliveryResourcesGraph["shipping_profiles"]
  >
  regions: Array<{
    id: string
    name: string
    currency_code: string
    country_codes: string[]
  }>
  delivery_options: MerchantDeliveryMethod[]
}

async function readMerchantDeliveryResources(
  container: MedusaContainer,
  merchantId: ResolvedMerchantId
): Promise<MerchantDeliveryResources> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: merchantData } = await query.graph({
    entity: "merchant",
    fields: [
      "stock_locations.id",
      "stock_locations.name",
      "stock_locations.address.*",
      "shipping_profiles.id",
      "shipping_profiles.name",
      "shipping_profiles.type",
    ],
    filters: { id: merchantId },
  })
  const merchant = (
    merchantData as unknown as MerchantDeliveryResourcesGraph[]
  )[0]
  const stockLocations = merchant?.stock_locations ?? []
  const shippingProfiles = merchant?.shipping_profiles ?? []
  const { data: regionData } = await query.graph({
    entity: "region",
    fields: ["id", "name", "currency_code", "countries.iso_2"],
  })
  const regions = (regionData as unknown as Array<{
    id: string
    name: string
    currency_code: string
    countries?: Array<{ iso_2: string }>
  }>).map((region) => ({
    id: region.id,
    name: region.name,
    currency_code: region.currency_code,
    country_codes: (region.countries ?? []).map(({ iso_2 }) => {
      return iso_2.toLowerCase()
    }),
  }))

  if (!stockLocations.length) {
    return {
      stock_locations: [],
      shipping_profiles: shippingProfiles,
      regions,
      delivery_options: [],
    }
  }

  const { data: linkData } = await query.graph({
    entity: "location_fulfillment_set",
    fields: ["stock_location_id", "fulfillment_set_id"],
    filters: {
      stock_location_id: stockLocations.map(({ id }) => id),
    },
  })
  const fulfillmentLinks =
    linkData as unknown as LocationFulfillmentSetGraph[]
  const fulfillmentSetIds = Array.from(
    new Set(fulfillmentLinks.map(({ fulfillment_set_id }) => {
      return fulfillment_set_id
    }))
  )

  if (!fulfillmentSetIds.length) {
    return {
      stock_locations: stockLocations,
      shipping_profiles: shippingProfiles,
      regions,
      delivery_options: [],
    }
  }

  const { data: zoneData } = await query.graph({
    entity: "service_zone",
    fields: [
      "id",
      "name",
      "fulfillment_set_id",
      "geo_zones.id",
      "geo_zones.type",
      "geo_zones.country_code",
    ],
    filters: { fulfillment_set_id: fulfillmentSetIds },
  })
  const serviceZones = zoneData as unknown as ServiceZoneGraph[]

  if (!serviceZones.length) {
    return {
      stock_locations: stockLocations,
      shipping_profiles: shippingProfiles,
      regions,
      delivery_options: [],
    }
  }

  const { data: optionData } = await query.graph({
    entity: "shipping_option",
    fields: [
      "id",
      "name",
      "price_type",
      "service_zone_id",
      "shipping_profile_id",
      "data",
      "type.id",
      "type.label",
      "type.description",
      "type.code",
      "rules.id",
      "rules.attribute",
      "rules.operator",
      "rules.value",
      "prices.id",
      "prices.amount",
      "prices.currency_code",
      "prices.region_id",
      "created_at",
      "updated_at",
    ],
    filters: {
      service_zone_id: serviceZones.map(({ id }) => id),
    },
  })
  const shippingOptions = optionData as unknown as DeliveryGraph[]
  const locationsById = new Map(
    stockLocations.map((location) => [location.id, location])
  )
  const profilesById = new Map(
    shippingProfiles.map((profile) => [profile.id, profile])
  )
  const locationsByFulfillmentSetId = new Map(
    fulfillmentLinks.map((link) => [
      link.fulfillment_set_id,
      locationsById.get(link.stock_location_id),
    ])
  )
  const zonesById = new Map(
    serviceZones.map((zone) => [zone.id, zone])
  )
  const deliveryOptions = shippingOptions.flatMap((option) => {
    const data = option.data ?? {}
    const zone = zonesById.get(option.service_zone_id)
    const location = zone
      ? locationsByFulfillmentSetId.get(zone.fulfillment_set_id)
      : undefined
    const profile = profilesById.get(option.shipping_profile_id)

    if (
      data.merchant_delivery !== true ||
      data.merchant_id !== merchantId ||
      !zone ||
      !location ||
      !profile
    ) {
      return []
    }

    const currencyPrice = (option.prices ?? []).find(
      ({ currency_code }) => Boolean(currency_code)
    )

    return [{
      id: option.id,
      name: option.name,
      description: option.type?.description ?? null,
      estimated_delivery:
        typeof data.estimated_delivery === "string"
          ? data.estimated_delivery
          : null,
      is_enabled: data.is_enabled !== false,
      is_default: data.is_default === true,
      stock_location: {
        id: location.id,
        name: location.name,
      },
      shipping_profile: profile,
      service_zone: {
        id: zone.id,
        name: zone.name,
        fulfillment_set_id: zone.fulfillment_set_id,
        country_codes: (zone.geo_zones ?? [])
          .filter(({ type }) => type === "country")
          .map(({ country_code }) => country_code.toLowerCase())
          .sort(),
      },
      price: currencyPrice?.currency_code
        ? {
            id: currencyPrice.id,
            amount: Number(currencyPrice.amount),
            currency_code: currencyPrice.currency_code,
          }
        : null,
      created_at: option.created_at,
      updated_at: option.updated_at,
    }]
  })

  deliveryOptions.sort((left, right) => {
    if (left.is_default !== right.is_default) {
      return left.is_default ? -1 : 1
    }

    return left.name.localeCompare(right.name)
  })

  return {
    stock_locations: stockLocations,
    shipping_profiles: shippingProfiles,
    regions,
    delivery_options: deliveryOptions,
  }
}

const listMerchantDeliveryResourcesStep = createStep(
  "list-merchant-delivery-resources",
  async (
    input: { merchant_id: ResolvedMerchantId },
    { container }
  ) => {
    return new StepResponse(
      await readMerchantDeliveryResources(container, input.merchant_id)
    )
  }
)

const validateMerchantDeliveryReferencesStep = createStep(
  "validate-merchant-delivery-references",
  async (
    input: {
      merchant_id: ResolvedMerchantId
      stock_location_id: string
      shipping_profile_id: string
    },
    { container }
  ) => {
    await assertMerchantOwns(
      container,
      "stock_location",
      input.stock_location_id,
      input.merchant_id
    )
    await assertMerchantOwns(
      container,
      "shipping_profile",
      input.shipping_profile_id,
      input.merchant_id
    )

    return new StepResponse(input)
  }
)

const prepareMerchantDeliveryInfrastructureStep = createStep(
  "prepare-merchant-delivery-infrastructure",
  async (input: { merchant_id: ResolvedMerchantId }) => {
    const token = generateEntityId(undefined, "mdelivery")

    return new StepResponse({
      fulfillment_set_name: `${input.merchant_id}:${token}:set`,
      service_zone_name: `${input.merchant_id}:${token}:zone`,
      shipping_option_code: token,
    })
  }
)

const ensureLocationFulfillmentProviderStep = createStep(
  "ensure-location-fulfillment-provider",
  async (input: { stock_location_id: string }, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "location_fulfillment_provider",
      fields: ["stock_location_id", "fulfillment_provider_id"],
      filters: {
        stock_location_id: input.stock_location_id,
        fulfillment_provider_id: manualFulfillmentProviderId,
      },
    })

    if (data.length) {
      return new StepResponse({ created: false }, null)
    }

    const link = container.resolve(ContainerRegistrationKeys.LINK)
    const linkDefinition = {
      [Modules.STOCK_LOCATION]: {
        stock_location_id: input.stock_location_id,
      },
      [Modules.FULFILLMENT]: {
        fulfillment_provider_id: manualFulfillmentProviderId,
      },
    }

    await link.create(linkDefinition)

    return new StepResponse(
      { created: true },
      linkDefinition
    )
  },
  async (linkDefinition, { container }) => {
    if (!linkDefinition) {
      return
    }

    const link = container.resolve(ContainerRegistrationKeys.LINK)
    await link.dismiss(linkDefinition)
  }
)

const associateMerchantDeliveryFulfillmentSetStep = createStep(
  "associate-merchant-delivery-fulfillment-set",
  async (
    input: { stock_location_id: string; fulfillment_set_id: string },
    { container }
  ) => {
    const linkDefinition = {
      [Modules.STOCK_LOCATION]: {
        stock_location_id: input.stock_location_id,
      },
      [Modules.FULFILLMENT]: {
        fulfillment_set_id: input.fulfillment_set_id,
      },
    }
    const link = container.resolve(ContainerRegistrationKeys.LINK)

    await link.create(linkDefinition)

    return new StepResponse(linkDefinition, linkDefinition)
  },
  async (linkDefinition, { container }) => {
    if (!linkDefinition) {
      return
    }

    const link = container.resolve(ContainerRegistrationKeys.LINK)
    await link.dismiss(linkDefinition)
  }
)

const retrieveMerchantDeliveryMethodStep = createStep(
  "retrieve-merchant-delivery-method",
  async (
    input: {
      merchant_id: ResolvedMerchantId
      delivery_option_id: string
    },
    { container }
  ) => {
    const resources = await readMerchantDeliveryResources(
      container,
      input.merchant_id
    )
    const method = resources.delivery_options.find(
      ({ id }) => id === input.delivery_option_id
    )

    if (!method) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        "Delivery method not found"
      )
    }

    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "shipping_option",
      fields: [
        "id",
        "data",
        "type.id",
        "type.code",
        "rules.id",
        "rules.attribute",
        "rules.operator",
        "rules.value",
      ],
      filters: { id: input.delivery_option_id },
    })
    const option = (data as unknown as DeliveryGraph[])[0]

    if (!option?.type?.id) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        "Delivery method not found"
      )
    }

    return new StepResponse({
      ...method,
      data: option.data ?? {},
      type: option.type,
      rules: option.rules ?? [],
    })
  }
)

const moveMerchantDeliveryLocationStep = createStep(
  "move-merchant-delivery-location",
  async (
    input: {
      current_location_id: string
      next_location_id: string
      fulfillment_set_id: string
    },
    { container }
  ) => {
    if (input.current_location_id === input.next_location_id) {
      return new StepResponse({ moved: false }, null)
    }

    const link = container.resolve(ContainerRegistrationKeys.LINK)
    const previousLink = {
      [Modules.STOCK_LOCATION]: {
        stock_location_id: input.current_location_id,
      },
      [Modules.FULFILLMENT]: {
        fulfillment_set_id: input.fulfillment_set_id,
      },
    }
    const nextLink = {
      [Modules.STOCK_LOCATION]: {
        stock_location_id: input.next_location_id,
      },
      [Modules.FULFILLMENT]: {
        fulfillment_set_id: input.fulfillment_set_id,
      },
    }

    await link.create(nextLink)

    try {
      await link.dismiss(previousLink)
    } catch (error) {
      await link.dismiss(nextLink)
      throw error
    }

    return new StepResponse(
      { moved: true },
      { previous_link: previousLink, next_link: nextLink }
    )
  },
  async (links, { container }) => {
    if (!links) {
      return
    }

    const link = container.resolve(ContainerRegistrationKeys.LINK)
    await link.create(links.previous_link)
    await link.dismiss(links.next_link)
  }
)

const clearOtherDefaultDeliveryMethodsStep = createStep(
  "clear-other-default-delivery-methods",
  async (
    input: {
      merchant_id: ResolvedMerchantId
      excluded_option_id: string
      should_clear: boolean
    },
    { container }
  ) => {
    if (!input.should_clear) {
      return new StepResponse([], [])
    }

    const resources = await readMerchantDeliveryResources(
      container,
      input.merchant_id
    )
    const defaults = resources.delivery_options.filter((option) => {
      return option.is_default && option.id !== input.excluded_option_id
    })

    if (!defaults.length) {
      return new StepResponse([], [])
    }

    const fulfillmentService =
      container.resolve<FulfillmentTypes.IFulfillmentModuleService>(
        Modules.FULFILLMENT
      )
    const previous = [] as Array<{
      id: string
      data: Record<string, unknown> | null
    }>

    for (const option of defaults) {
      const existing = await fulfillmentService.retrieveShippingOption(
        option.id
      )
      previous.push({ id: option.id, data: existing.data })
      await fulfillmentService.updateShippingOptions(option.id, {
        data: {
          ...(existing.data ?? {}),
          is_default: false,
        },
      })
    }

    return new StepResponse(
      defaults.map(({ id }) => id),
      previous
    )
  },
  async (previous, { container }) => {
    if (!previous?.length) {
      return
    }

    const fulfillmentService =
      container.resolve<FulfillmentTypes.IFulfillmentModuleService>(
        Modules.FULFILLMENT
      )

    for (const option of previous) {
      await fulfillmentService.updateShippingOptions(option.id, {
        data: option.data,
      })
    }
  }
)

function normalizeCountries(countryCodes: string[]) {
  return Array.from(new Set(countryCodes.map((countryCode) => {
    return countryCode.trim().toLowerCase()
  }))).sort()
}

function deliveryData(
  input: MerchantDeliveryMethodInput,
  merchantId: ResolvedMerchantId,
  existing: DeliveryOptionData = {}
): DeliveryOptionData {
  return {
    ...existing,
    merchant_delivery: true,
    merchant_id: merchantId,
    estimated_delivery: input.estimated_delivery?.trim() || null,
    is_enabled: input.is_enabled,
    is_default: input.is_default,
  }
}

function deliveryRules(
  existingRules: DeliveryGraph["rules"],
  isEnabled: boolean
) {
  const desiredRules = new Map([
    ["enabled_in_store", isEnabled ? "true" : "false"],
    ["is_return", "false"],
  ])
  const rules = (existingRules ?? []).map((rule) => {
    const desiredValue = desiredRules.get(rule.attribute)

    if (desiredValue !== undefined) {
      desiredRules.delete(rule.attribute)
    }

    return {
      id: rule.id,
      attribute: rule.attribute,
      operator: rule.operator,
      value: desiredValue ?? rule.value,
    }
  })

  for (const [attribute, value] of desiredRules) {
    rules.push({
      attribute,
      operator: "eq",
      value,
    } as typeof rules[number])
  }

  return rules
}

export const listMerchantDeliveryMethodsWorkflow = createWorkflow(
  "list-merchant-delivery-methods",
  function (input: MerchantScopeInput) {
    const scope = validateMerchantScopeStep(input)
    const resources = listMerchantDeliveryResourcesStep({
      merchant_id: scope.merchant_id,
    })

    return new WorkflowResponse(resources)
  }
)

export const createMerchantDeliveryMethodWorkflow = createWorkflow(
  "create-merchant-delivery-method",
  function (input: MerchantDeliveryMethodInput) {
    const scope = validateMerchantScopeStep(input)
    const references = validateMerchantDeliveryReferencesStep({
      merchant_id: scope.merchant_id,
      stock_location_id: input.stock_location_id,
      shipping_profile_id: input.shipping_profile_id,
    })
    const prepared = prepareMerchantDeliveryInfrastructureStep({
      merchant_id: scope.merchant_id,
    })
    const providerReady = ensureLocationFulfillmentProviderStep({
      stock_location_id: references.stock_location_id,
    })
    const fulfillmentSets = createFulfillmentSets([
      {
        name: prepared.fulfillment_set_name,
        type: "shipping",
      },
    ])
    const associationInput = transform(
      { references, fulfillmentSets },
      ({ references, fulfillmentSets }) => ({
        stock_location_id: references.stock_location_id,
        fulfillment_set_id: fulfillmentSets[0].id,
      })
    )
    const locationAssociation =
      associateMerchantDeliveryFulfillmentSetStep(associationInput)
    const zoneInput = transform(
      { input, prepared, fulfillmentSets },
      ({ input, prepared, fulfillmentSets }) => ({
        data: [{
          name: prepared.service_zone_name,
          fulfillment_set_id: fulfillmentSets[0].id,
          geo_zones: normalizeCountries(input.country_codes).map(
            (countryCode) => ({
              type: "country" as const,
              country_code: countryCode,
            })
          ),
        }],
      })
    )
    const serviceZones = createServiceZonesWorkflow.runAsStep({
      input: zoneInput,
    })
    const shippingOptionInput = transform(
      {
        input,
        scope,
        prepared,
        providerReady,
        locationAssociation,
        serviceZones,
      },
      ({ input, scope, prepared, serviceZones }) => [{
        name: input.name,
        price_type: "flat" as const,
        provider_id: manualFulfillmentProviderId,
        service_zone_id: serviceZones[0].id,
        shipping_profile_id: input.shipping_profile_id,
        data: deliveryData(input, scope.merchant_id),
        type: {
          label: input.name,
          description: input.description?.trim() || undefined,
          code: prepared.shipping_option_code,
        },
        prices: [{
          amount: input.price.amount,
          currency_code: input.price.currency_code.toLowerCase(),
        }],
        rules: deliveryRules([], input.is_enabled),
      }]
    )
    const shippingOptions = createShippingOptionsWorkflow.runAsStep({
      input: shippingOptionInput as unknown as FulfillmentWorkflow.CreateShippingOptionsWorkflowInput[],
    })
    const defaultInput = transform(
      { input, scope, shippingOptions },
      ({ input, scope, shippingOptions }) => ({
        merchant_id: scope.merchant_id,
        excluded_option_id: shippingOptions[0].id,
        should_clear: input.is_default,
      })
    )

    clearOtherDefaultDeliveryMethodsStep(defaultInput)

    return new WorkflowResponse(shippingOptions)
  }
)

export const updateMerchantDeliveryMethodWorkflow = createWorkflow(
  "update-merchant-delivery-method",
  function (input: UpdateMerchantDeliveryMethodInput) {
    const scope = validateMerchantScopeStep(input)
    const references = validateMerchantDeliveryReferencesStep({
      merchant_id: scope.merchant_id,
      stock_location_id: input.stock_location_id,
      shipping_profile_id: input.shipping_profile_id,
    })
    const method = retrieveMerchantDeliveryMethodStep({
      merchant_id: scope.merchant_id,
      delivery_option_id: input.delivery_option_id,
    })
    const providerReady = ensureLocationFulfillmentProviderStep({
      stock_location_id: references.stock_location_id,
    })
    const moveInput = transform(
      { input, method, providerReady },
      ({ input, method }) => ({
        current_location_id: method.stock_location.id,
        next_location_id: input.stock_location_id,
        fulfillment_set_id: method.service_zone.fulfillment_set_id,
      })
    )
    const locationMove = moveMerchantDeliveryLocationStep(moveInput)
    const zoneInput = transform(
      { input, method },
      ({ input, method }) => ({
        selector: { id: method.service_zone.id },
        update: {
          geo_zones: normalizeCountries(input.country_codes).map(
            (countryCode) => ({
              type: "country" as const,
              country_code: countryCode,
            })
          ),
        },
      })
    )

    updateServiceZonesWorkflow.runAsStep({ input: zoneInput })

    const typeInput = transform(
      { input, method },
      ({ input, method }) => ({
        selector: { id: method.type.id },
        update: {
          label: input.name,
          description: input.description?.trim() || "",
        },
      })
    )

    updateShippingOptionTypesWorkflow.runAsStep({ input: typeInput })

    const shippingOptionInput = transform(
      { input, scope, method, locationMove },
      ({ input, scope, method }) => [{
        id: method.id,
        name: input.name,
        shipping_profile_id: input.shipping_profile_id,
        data: deliveryData(input, scope.merchant_id, method.data),
        price_type: "flat" as const,
        prices: [{
          amount: input.price.amount,
          currency_code: input.price.currency_code.toLowerCase(),
        }],
        rules: deliveryRules(method.rules, input.is_enabled),
      }]
    )
    const shippingOptions = updateShippingOptionsWorkflow.runAsStep({
      input: shippingOptionInput as unknown as FulfillmentWorkflow.UpdateShippingOptionsWorkflowInput[],
    })
    const defaultInput = transform(
      { input, scope, shippingOptions },
      ({ input, scope }) => ({
        merchant_id: scope.merchant_id,
        excluded_option_id: input.delivery_option_id,
        should_clear: input.is_default,
      })
    )

    clearOtherDefaultDeliveryMethodsStep(defaultInput)

    return new WorkflowResponse(shippingOptions)
  }
)
