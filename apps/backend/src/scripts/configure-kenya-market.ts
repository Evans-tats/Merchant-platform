import type { ExecArgs } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import {
  createRegionsWorkflow,
  createTaxRegionsWorkflow,
  deleteRegionsWorkflow,
  deleteTaxRegionsWorkflow,
  updateProductVariantsWorkflow,
  updateServiceZonesWorkflow,
  updateShippingOptionsWorkflow,
  updateStockLocationsWorkflow,
  updateStoresWorkflow,
} from "@medusajs/medusa/core-flows"
import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"

type FulfillmentSetNameUpdate = {
  id: string
  previous_name: string
  next_name: string
}

const updateFulfillmentSetNamesStep = createStep(
  "configure-kenya-fulfillment-set-names",
  async (
    input: { updates: FulfillmentSetNameUpdate[] },
    { container }
  ) => {
    const fulfillmentService = container.resolve(Modules.FULFILLMENT)

    await fulfillmentService.updateFulfillmentSets(
      input.updates.map(({ id, next_name }) => ({ id, name: next_name }))
    )

    return new StepResponse(input.updates, input.updates)
  },
  async (updates, { container }) => {
    if (!updates?.length) {
      return
    }

    const fulfillmentService = container.resolve(Modules.FULFILLMENT)
    await fulfillmentService.updateFulfillmentSets(
      updates.map(({ id, previous_name }) => ({
        id,
        name: previous_name,
      }))
    )
  }
)

const updateFulfillmentSetNamesWorkflow = createWorkflow(
  "configure-kenya-fulfillment-set-names-workflow",
  function (input: { updates: FulfillmentSetNameUpdate[] }) {
    const result = updateFulfillmentSetNamesStep(input)
    return new WorkflowResponse(result)
  }
)

type RegionRecord = {
  id: string
  name: string
  currency_code: string
  countries?: Array<{ iso_2: string }>
}

type TaxRegionRecord = {
  id: string
  country_code: string
}

type FulfillmentSetRecord = {
  id: string
  name: string
  service_zones?: Array<{
    id: string
    name: string
    geo_zones?: Array<{ country_code?: string | null }>
  }>
}

type ShippingOptionRecord = {
  id: string
  name: string
  price_type: "flat" | "calculated"
  prices?: Array<{
    amount: number
    currency_code?: string | null
  }>
}

type ProductVariantRecord = {
  id: string
  sku?: string | null
  prices?: Array<{
    amount: number
    currency_code?: string | null
  }>
}

function demoVariantKesPrice(sku?: string | null) {
  if (sku?.endsWith("A-TSHIRT")) {
    return 2500
  }

  if (sku?.endsWith("B-SWEATSHIRT")) {
    return 3500
  }

  if (
    sku?.startsWith("SHIRT-") ||
    sku?.startsWith("SWEATSHIRT-") ||
    sku?.startsWith("SWEATPANTS-") ||
    sku?.startsWith("SHORTS-")
  ) {
    return 1500
  }

  return null
}

export default async function configureKenyaMarket({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const { data: regionData } = await query.graph({
    entity: "region",
    fields: ["id", "name", "currency_code", "countries.iso_2"],
  })
  const existingRegions = regionData as unknown as RegionRecord[]
  let kenyaRegion = existingRegions.find((region) => {
    return region.countries?.some(({ iso_2 }) => iso_2 === "ke")
  })

  if (!kenyaRegion) {
    const { result } = await createRegionsWorkflow(container).run({
      input: {
        regions: [
          {
            name: "Kenya",
            currency_code: "kes",
            countries: ["ke"],
            payment_providers: ["pp_system_default"],
          },
        ],
      },
    })
    kenyaRegion = result[0]
  }

  const { data: stores } = await query.graph({
    entity: "store",
    fields: ["id"],
  })

  for (const store of stores as unknown as Array<{ id: string }>) {
    await updateStoresWorkflow(container).run({
      input: {
        selector: { id: store.id },
        update: {
          supported_currencies: [
            {
              currency_code: "kes",
              is_default: true,
            },
          ],
          default_region_id: kenyaRegion.id,
        },
      },
    })
  }

  const { data: taxRegionData } = await query.graph({
    entity: "tax_region",
    fields: ["id", "country_code"],
  })
  const taxRegions = taxRegionData as unknown as TaxRegionRecord[]

  if (!taxRegions.some(({ country_code }) => country_code === "ke")) {
    await createTaxRegionsWorkflow(container).run({
      input: [
        {
          country_code: "ke",
          provider_id: "tp_system",
        },
      ],
    })
  }

  const nonKenyanTaxRegionIds = taxRegions
    .filter(({ country_code }) => country_code !== "ke")
    .map(({ id }) => id)

  if (nonKenyanTaxRegionIds.length) {
    await deleteTaxRegionsWorkflow(container).run({
      input: { ids: nonKenyanTaxRegionIds },
    })
  }

  const { data: stockLocations } = await query.graph({
    entity: "stock_location",
    fields: ["id", "name", "address.country_code"],
  })
  const europeanWarehouse = (stockLocations as unknown as Array<{
    id: string
    name: string
    address?: { country_code?: string | null } | null
  }>).find((location) => {
    return location.name === "European Warehouse" ||
      location.address?.country_code?.toLowerCase() === "dk"
  })

  if (europeanWarehouse) {
    await updateStockLocationsWorkflow(container).run({
      input: {
        selector: { id: europeanWarehouse.id },
        update: {
          name: "Nairobi Warehouse",
          address: {
            address_1: "",
            city: "Nairobi",
            country_code: "KE",
          },
        },
      },
    })
  }

  const { data: fulfillmentSetData } = await query.graph({
    entity: "fulfillment_set",
    fields: [
      "id",
      "name",
      "service_zones.id",
      "service_zones.name",
      "service_zones.geo_zones.country_code",
    ],
  })
  const fulfillmentSets = fulfillmentSetData as unknown as FulfillmentSetRecord[]

  for (const fulfillmentSet of fulfillmentSets) {
    for (const serviceZone of fulfillmentSet.service_zones ?? []) {
      const countryCodes = (serviceZone.geo_zones ?? []).map(
        ({ country_code }) => country_code?.toLowerCase()
      )

      if (countryCodes.length !== 1 || countryCodes[0] !== "ke") {
        await updateServiceZonesWorkflow(container).run({
          input: {
            selector: { id: serviceZone.id },
            update: {
              name: serviceZone.name === "Europe" ? "Kenya" : serviceZone.name,
              geo_zones: [
                {
                  type: "country",
                  country_code: "ke",
                },
              ],
            },
          },
        })
      }
    }
  }

  const fulfillmentSetNameUpdates = fulfillmentSets
    .filter(({ name }) => name === "European Warehouse delivery")
    .map(({ id, name }) => ({
      id,
      previous_name: name,
      next_name: "Kenya delivery",
    }))

  if (fulfillmentSetNameUpdates.length) {
    await updateFulfillmentSetNamesWorkflow(container).run({
      input: { updates: fulfillmentSetNameUpdates },
    })
  }

  const { data: shippingOptionData } = await query.graph({
    entity: "shipping_option",
    fields: ["id", "name", "price_type", "prices.amount", "prices.currency_code"],
  })

  for (const option of shippingOptionData as unknown as ShippingOptionRecord[]) {
    if (option.price_type !== "flat") {
      continue
    }

    const amount = option.name === "Standard Shipping"
      ? 500
      : option.name === "Express Shipping"
        ? 1000
        : option.prices?.[0]?.amount ?? 0

    await updateShippingOptionsWorkflow(container).run({
      input: [
        {
          id: option.id,
          prices: [
            {
              currency_code: "kes",
              amount,
            },
          ],
        },
      ],
    })
  }

  const { data: productVariantData } = await query.graph({
    entity: "product_variant",
    fields: ["id", "sku", "prices.amount", "prices.currency_code"],
  })
  const variantUpdates = (productVariantData as unknown as ProductVariantRecord[])
    .map((variant) => ({
      id: variant.id,
      amount: variant.prices?.find(({ currency_code }) => {
        return currency_code === "kes"
      })?.amount ?? demoVariantKesPrice(variant.sku),
    }))
    .filter((variant): variant is { id: string; amount: number } => {
      return variant.amount !== null
    })

  if (variantUpdates.length) {
    await updateProductVariantsWorkflow(container).run({
      input: {
        product_variants: variantUpdates.map(({ id, amount }) => ({
          id,
          prices: [
            {
              currency_code: "kes",
              amount,
            },
          ],
        })),
      },
    })
  }

  const nonKenyanRegionIds = existingRegions
    .filter(({ id }) => id !== kenyaRegion.id)
    .map(({ id }) => id)

  if (nonKenyanRegionIds.length) {
    await deleteRegionsWorkflow(container).run({
      input: { ids: nonKenyanRegionIds },
    })
  }

  logger.info("Kenya is now the only configured market and region")
}
