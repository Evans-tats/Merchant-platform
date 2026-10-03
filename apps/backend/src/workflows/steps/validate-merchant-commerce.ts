import type {
  InventoryTypes,
  ProductTypes,
} from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import {
  createStep,
  StepResponse,
} from "@medusajs/framework/workflows-sdk"

import {
  assertMerchantOwns,
  type ResolvedMerchantId,
} from "../../services/tenant-resolution"

export type ValidatedMerchantScope = {
  merchant_id: ResolvedMerchantId
  sales_channel_id: string
  shipping_profile_id: string
}

export type MerchantScopeInput = {
  merchant_id: string
  sales_channel_id: string
}

type MerchantScopeGraph = {
  id: string
  status: string
  primary_sales_channel?: { id: string } | null
  shipping_profiles?: Array<{ id: string; type: string }>
}

type ProductReferences = Pick<
  ProductTypes.CreateProductDTO,
  "category_ids" | "collection_id"
> & { shipping_profile_id?: string | null }

type ProductVariantInventoryLink = {
  inventory_item_id: string
  variant_id: string
}

type ProductVariantGraph = {
  id: string
  manage_inventory?: boolean
  allow_backorder?: boolean
  product?: {
    id: string
    sales_channels?: Array<{ id: string }>
  } | null
  inventory?: Array<{
    location_levels?: Array<{ location_id: string }>
  }>
}

type MerchantStockLocationsGraph = {
  stock_locations?: Array<{ id: string }>
}

type MerchantCartGraph = {
  id: string
  sales_channel_id?: string | null
  merchant?: { id: string } | null
  items?: Array<{
    variant_id?: string | null
  }>
}

export const validateMerchantScopeStep = createStep(
  "validate-merchant-scope",
  async (input: MerchantScopeInput, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "merchant",
      fields: [
        "id",
        "status",
        "primary_sales_channel.id",
        "shipping_profiles.id",
        "shipping_profiles.type",
      ],
      filters: { id: input.merchant_id },
    })
    const merchant = (data as unknown as MerchantScopeGraph[])[0]

    const shippingProfile = merchant?.shipping_profiles?.find(
      ({ type }) => type === "default"
    )

    if (
      !merchant ||
      merchant.status !== "active" ||
      merchant.primary_sales_channel?.id !== input.sales_channel_id ||
      !shippingProfile
    ) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        "Merchant commerce scope not found"
      )
    }

    return new StepResponse({
      merchant_id: merchant.id as ResolvedMerchantId,
      sales_channel_id: merchant.primary_sales_channel.id,
      shipping_profile_id: shippingProfile.id,
    })
  }
)

export const validateMerchantProductReferencesStep = createStep(
  "validate-merchant-product-references",
  async (
    input: {
      scope: ValidatedMerchantScope
      products: ProductReferences[]
    },
    { container }
  ) => {
    for (const product of input.products) {
      if (product.collection_id) {
        await assertMerchantOwns(
          container,
          "product_collection",
          product.collection_id,
          input.scope.merchant_id
        )
      }

      if (product.shipping_profile_id) {
        await assertMerchantOwns(
          container,
          "shipping_profile",
          product.shipping_profile_id,
          input.scope.merchant_id
        )
      }

      for (const categoryId of product.category_ids ?? []) {
        await assertMerchantOwns(
          container,
          "product_category",
          categoryId,
          input.scope.merchant_id
        )
      }
    }

    return new StepResponse(input.products)
  }
)

export const validateMerchantResourceStep = createStep(
  "validate-merchant-resource",
  async (
    input: {
      scope: ValidatedMerchantScope
      resource_type:
        | "product"
        | "product_category"
        | "product_collection"
        | "stock_location"
        | "order"
      resource_id: string
    },
    { container }
  ) => {
    await assertMerchantOwns(
      container,
      input.resource_type,
      input.resource_id,
      input.scope.merchant_id
    )

    return new StepResponse(input)
  }
)

export const validateMerchantProductIdsStep = createStep(
  "validate-merchant-product-ids",
  async (
    input: {
      scope: ValidatedMerchantScope
      product_ids: string[]
    },
    { container }
  ) => {
    for (const productId of input.product_ids) {
      await assertMerchantOwns(
        container,
        "product",
        productId,
        input.scope.merchant_id
      )
    }

    return new StepResponse(input.product_ids)
  }
)

export const validateMerchantCartVariantsStep = createStep(
  "validate-merchant-cart-variants",
  async (
    input: {
      scope: ValidatedMerchantScope
      variant_ids: string[]
    },
    { container }
  ) => {
    if (!input.variant_ids.length) {
      return new StepResponse(input.variant_ids)
    }

    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "product_variant",
      fields: [
        "id",
        "manage_inventory",
        "allow_backorder",
        "product.id",
        "product.sales_channels.id",
        "inventory.location_levels.location_id",
      ],
      filters: { id: input.variant_ids },
    })
    const variants = data as unknown as ProductVariantGraph[]
    const { data: merchantData } = await query.graph({
      entity: "merchant",
      fields: ["stock_locations.id"],
      filters: { id: input.scope.merchant_id },
    })
    const merchant = (
      merchantData as unknown as MerchantStockLocationsGraph[]
    )[0]
    const ownedLocationIds = new Set(
      (merchant?.stock_locations ?? []).map(({ id }) => id)
    )

    if (variants.length !== new Set(input.variant_ids).size) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        "product not found"
      )
    }

    for (const variant of variants) {
      const product = variant.product

      if (
        !product?.id ||
        !product.sales_channels?.some(
          ({ id }) => id === input.scope.sales_channel_id
        )
      ) {
        throw new MedusaError(
          MedusaError.Types.NOT_FOUND,
          "product not found"
        )
      }

      await assertMerchantOwns(
        container,
        "product",
        product.id,
        input.scope.merchant_id
      )

      if (variant.manage_inventory) {
        const inventory = variant.inventory ?? []
        const locationIds = inventory.flatMap(({ location_levels }) => {
          return (location_levels ?? []).map(
            ({ location_id }) => location_id
          )
        })

        if (
          inventory.length === 0 ||
          locationIds.some(
            (locationId) => !ownedLocationIds.has(locationId)
          ) ||
          (!variant.allow_backorder && locationIds.length === 0)
        ) {
          throw new MedusaError(
            MedusaError.Types.NOT_FOUND,
            "product not found"
          )
        }
      }
    }

    return new StepResponse(input.variant_ids)
  }
)

export const validateMerchantCartStep = createStep(
  "validate-merchant-cart",
  async (
    input: {
      scope: ValidatedMerchantScope
      cart_id: string
    },
    { container }
  ) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "cart",
      fields: [
        "id",
        "sales_channel_id",
        "merchant.id",
        "items.variant_id",
      ],
      filters: { id: input.cart_id },
    })
    const cart = (data as unknown as MerchantCartGraph[])[0]

    if (
      !cart ||
      cart.merchant?.id !== input.scope.merchant_id ||
      cart.sales_channel_id !== input.scope.sales_channel_id
    ) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        "cart not found"
      )
    }

    return new StepResponse(
      (cart.items ?? [])
        .map(({ variant_id }) => variant_id)
        .filter((id): id is string => Boolean(id))
    )
  }
)

export const validateMerchantCategoryParentsStep = createStep(
  "validate-merchant-category-parents",
  async (
    input: {
      scope: ValidatedMerchantScope
      parent_category_ids: string[]
    },
    { container }
  ) => {
    for (const categoryId of input.parent_category_ids) {
      await assertMerchantOwns(
        container,
        "product_category",
        categoryId,
        input.scope.merchant_id
      )
    }

    return new StepResponse(input.parent_category_ids)
  }
)

export const validateMerchantInventoryLevelsStep = createStep(
  "validate-merchant-inventory-levels",
  async (
    input: {
      scope: ValidatedMerchantScope
      create: InventoryTypes.CreateInventoryLevelInput[]
      update: InventoryTypes.UpdateInventoryLevelInput[]
    },
    { container }
  ) => {
    const levels = [...input.create, ...input.update]
    const inventoryItemIds = Array.from(
      new Set(levels.map(({ inventory_item_id }) => inventory_item_id))
    )

    for (const level of levels) {
      await assertMerchantOwns(
        container,
        "stock_location",
        level.location_id,
        input.scope.merchant_id
      )
    }

    if (!inventoryItemIds.length) {
      return new StepResponse(input)
    }

    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data: linkData } = await query.graph({
      entity: "product_variant_inventory_item",
      fields: ["inventory_item_id", "variant_id"],
      filters: { inventory_item_id: inventoryItemIds },
    })
    const links = linkData as unknown as ProductVariantInventoryLink[]
    const variantIdsByInventoryItem = new Map<string, string[]>()

    for (const link of links) {
      const variantIds = variantIdsByInventoryItem.get(
        link.inventory_item_id
      ) ?? []

      variantIds.push(link.variant_id)
      variantIdsByInventoryItem.set(link.inventory_item_id, variantIds)
    }

    for (const inventoryItemId of inventoryItemIds) {
      const variantIds = variantIdsByInventoryItem.get(inventoryItemId)

      if (!variantIds?.length) {
        throw new MedusaError(
          MedusaError.Types.NOT_FOUND,
          "inventory_item not found"
        )
      }

      const { data: variantData } = await query.graph({
        entity: "product_variant",
        fields: ["id", "product.id"],
        filters: { id: variantIds },
      })
      const variants = variantData as unknown as ProductVariantGraph[]

      for (const variant of variants) {
        if (!variant.product?.id) {
          throw new MedusaError(
            MedusaError.Types.NOT_FOUND,
            "inventory_item not found"
          )
        }

        await assertMerchantOwns(
          container,
          "product",
          variant.product.id,
          input.scope.merchant_id
        )
      }
    }

    return new StepResponse(input)
  }
)
