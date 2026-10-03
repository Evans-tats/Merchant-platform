import type {
  CreateStockLocationInput,
  InventoryTypes,
  LinkDefinition,
  UpdateStockLocationInput,
} from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
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
  batchInventoryItemLevelsWorkflow,
  createRemoteLinkStep,
  createStockLocationsWorkflow,
  updateStockLocationsWorkflow,
} from "@medusajs/medusa/core-flows"

import { MERCHANT_MODULE } from "../modules/merchant"
import type { ResolvedMerchantId } from "../services/tenant-resolution"
import {
  type MerchantScopeInput,
  validateMerchantInventoryLevelsStep,
  validateMerchantResourceStep,
  validateMerchantScopeStep,
} from "./steps/validate-merchant-commerce"

export type CreateMerchantStockLocationsInput = MerchantScopeInput & {
  locations: CreateStockLocationInput[]
}

export type UpdateMerchantStockLocationInput = MerchantScopeInput & {
  location_id: string
  update: UpdateStockLocationInput
}

export type AdjustMerchantInventoryInput = MerchantScopeInput & {
  create?: InventoryTypes.CreateInventoryLevelInput[]
  update?: InventoryTypes.UpdateInventoryLevelInput[]
}

type MerchantLocationsGraph = {
  stock_locations?: Array<Record<string, unknown>>
}

const listMerchantStockLocationsStep = createStep(
  "list-merchant-stock-locations",
  async (
    input: { merchant_id: ResolvedMerchantId },
    { container }
  ) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "merchant",
      fields: [
        "stock_locations.id",
        "stock_locations.name",
        "stock_locations.address.*",
        "stock_locations.sales_channels.id",
        "stock_locations.created_at",
        "stock_locations.updated_at",
      ],
      filters: { id: input.merchant_id },
    })
    const merchant = (data as unknown as MerchantLocationsGraph[])[0]

    return new StepResponse(merchant?.stock_locations ?? [])
  }
)

export const createMerchantStockLocationsWorkflow = createWorkflow(
  "create-merchant-stock-locations",
  function (input: CreateMerchantStockLocationsInput) {
    const scope = validateMerchantScopeStep(input)
    const locations = createStockLocationsWorkflow.runAsStep({
      input: { locations: input.locations },
    })
    const links = transform(
      { locations, scope },
      ({ locations, scope }) => {
        const links: LinkDefinition[] = []

        for (const location of locations) {
          links.push({
            [MERCHANT_MODULE]: {
              merchant_id: scope.merchant_id,
            },
            [Modules.STOCK_LOCATION]: {
              stock_location_id: location.id,
            },
          })
          links.push({
            [Modules.STOCK_LOCATION]: {
              stock_location_id: location.id,
            },
            [Modules.SALES_CHANNEL]: {
              sales_channel_id: scope.sales_channel_id,
            },
          })
        }

        return links
      }
    )

    createRemoteLinkStep(links)

    return new WorkflowResponse(locations)
  }
)

export const updateMerchantStockLocationWorkflow = createWorkflow(
  "update-merchant-stock-location",
  function (input: UpdateMerchantStockLocationInput) {
    const scope = validateMerchantScopeStep(input)

    validateMerchantResourceStep({
      scope,
      resource_type: "stock_location",
      resource_id: input.location_id,
    })
    const locations = updateStockLocationsWorkflow.runAsStep({
      input: {
        selector: { id: input.location_id },
        update: input.update,
      },
    })

    return new WorkflowResponse(locations)
  }
)

export const adjustMerchantInventoryWorkflow = createWorkflow(
  "adjust-merchant-inventory",
  function (input: AdjustMerchantInventoryInput) {
    const scope = validateMerchantScopeStep(input)
    const inventoryInput = transform({ input }, ({ input }) => ({
      create: input.create ?? [],
      update: input.update ?? [],
    }))

    validateMerchantInventoryLevelsStep({
      scope,
      create: inventoryInput.create,
      update: inventoryInput.update,
    })
    const result = batchInventoryItemLevelsWorkflow.runAsStep({
      input: {
        create: inventoryInput.create,
        update: inventoryInput.update,
        delete: [],
      },
    })

    return new WorkflowResponse(result)
  }
)

export const listMerchantStockLocationsWorkflow = createWorkflow(
  "list-merchant-stock-locations",
  function (input: MerchantScopeInput) {
    const scope = validateMerchantScopeStep(input)
    const locations = listMerchantStockLocationsStep({
      merchant_id: scope.merchant_id,
    })

    return new WorkflowResponse(locations)
  }
)
