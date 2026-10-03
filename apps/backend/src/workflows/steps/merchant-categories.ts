import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"
import {
  createStep,
  StepResponse,
} from "@medusajs/framework/workflows-sdk"

import {
  isOwnDescendant,
  orderCategoryTree,
  rankForPosition,
} from "../../services/merchant-categories"
import {
  assertMerchantOwns,
  listMerchantOwnedIds,
  type ResolvedMerchantId,
} from "../../services/tenant-resolution"

type CategoryGraph = {
  id: string
  name: string
  handle: string
  description: string | null
  is_active: boolean
  is_internal: boolean
  rank: number
  mpath: string
  parent_category_id: string | null
  created_at: string | Date
  updated_at: string | Date
  merchant?: { id: string } | null
  products?: Array<{ id: string } | null> | null
  category_children?: Array<{
    id: string
    name: string
    handle: string
    rank: number
  } | null> | null
}

type CategoryProductGraph = {
  id: string
  title: string
  handle: string
  status: string
  thumbnail: string | null
  merchant?: { id: string } | null
}

export type MerchantCategory = {
  id: string
  name: string
  handle: string
  description: string
  is_active: boolean
  is_internal: boolean
  rank: number
  parent_category_id: string | null
  product_count: number
  created_at: string | Date
  updated_at: string | Date
}

export type MerchantCategoryProduct = Omit<CategoryProductGraph, "merchant">

export type MerchantCategoryDetail = MerchantCategory & {
  path: Array<{ id: string; name: string }>
  category_children: Array<{ id: string; name: string; handle: string }>
  products: MerchantCategoryProduct[]
}

const categoryFields = [
  "id",
  "name",
  "handle",
  "description",
  "is_active",
  "is_internal",
  "rank",
  "mpath",
  "parent_category_id",
  "created_at",
  "updated_at",
]

function categoryNotFound() {
  return new MedusaError(MedusaError.Types.NOT_FOUND, "Category not found")
}

function idsOf(records?: Array<{ id: string } | null> | null): string[] {
  return (records ?? [])
    .map((record) => record?.id)
    .filter((id): id is string => Boolean(id))
}

function toMerchantCategory(
  category: CategoryGraph,
  productCount: number
): MerchantCategory {
  return {
    id: category.id,
    name: category.name,
    handle: category.handle,
    description: category.description ?? "",
    is_active: category.is_active,
    is_internal: category.is_internal,
    rank: category.rank,
    parent_category_id: category.parent_category_id,
    product_count: productCount,
    created_at: category.created_at,
    updated_at: category.updated_at,
  }
}

export const listMerchantCategoriesStep = createStep(
  "list-merchant-categories",
  async (input: { merchant_id: ResolvedMerchantId }, { container }) => {
    const ids = await listMerchantOwnedIds(
      container,
      input.merchant_id,
      "product_category"
    )

    if (!ids.length) {
      return new StepResponse({
        product_categories: [] as Array<MerchantCategory & { depth: number }>,
        count: 0,
      })
    }

    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "product_category",
      fields: [...categoryFields, "products.id"],
      filters: { id: ids },
    })
    const categories = orderCategoryTree(
      (data as unknown as CategoryGraph[]).map((category) =>
        toMerchantCategory(category, idsOf(category.products).length)
      )
    )

    return new StepResponse({
      product_categories: categories,
      count: categories.length,
    })
  }
)

/**
 * Returns the category only when the merchant owns it. Its path, subcategories
 * and products are limited to the merchant's own records.
 */
export const retrieveMerchantCategoryStep = createStep(
  "retrieve-merchant-category",
  async (
    input: { merchant_id: ResolvedMerchantId; category_id: string },
    { container }
  ) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "product_category",
      fields: [
        ...categoryFields,
        "merchant.id",
        "products.id",
        "category_children.id",
        "category_children.name",
        "category_children.handle",
        "category_children.rank",
      ],
      filters: { id: input.category_id },
    })
    const category = (data as unknown as CategoryGraph[])[0]

    if (!category || category.merchant?.id !== input.merchant_id) {
      throw categoryNotFound()
    }

    const ownedIds = new Set(
      await listMerchantOwnedIds(container, input.merchant_id, "product_category")
    )
    const ancestorIds = category.mpath
      .split(".")
      .filter((id) => id && id !== category.id && ownedIds.has(id))
    let path: Array<{ id: string; name: string }> = []

    if (ancestorIds.length) {
      const { data: ancestorData } = await query.graph({
        entity: "product_category",
        fields: ["id", "name"],
        filters: { id: ancestorIds },
      })
      const names = new Map(
        (ancestorData as unknown as Array<{ id: string; name: string }>).map(
          ({ id, name }) => [id, name]
        )
      )

      path = ancestorIds
        .filter((id) => names.has(id))
        .map((id) => ({ id, name: names.get(id)! }))
    }

    const productIds = idsOf(category.products)
    let products: MerchantCategoryProduct[] = []

    if (productIds.length) {
      const { data: productData } = await query.graph({
        entity: "product",
        fields: ["id", "title", "handle", "status", "thumbnail", "merchant.id"],
        filters: { id: productIds },
      })

      products = (productData as unknown as CategoryProductGraph[])
        .filter(({ merchant }) => merchant?.id === input.merchant_id)
        .map(({ id, title, handle, status, thumbnail }) => ({
          id,
          title,
          handle,
          status,
          thumbnail,
        }))
        .sort((a, b) => a.title.localeCompare(b.title))
    }

    const detail: MerchantCategoryDetail = {
      ...toMerchantCategory(category, products.length),
      path,
      category_children: (category.category_children ?? [])
        .filter((child): child is NonNullable<typeof child> =>
          Boolean(child && ownedIds.has(child.id))
        )
        .sort((a, b) => a.rank - b.rank)
        .map(({ id, name, handle }) => ({ id, name, handle })),
      products,
    }

    return new StepResponse(detail)
  }
)

/**
 * Checks a new parent before a category moves under it. Medusa doesn't stop a
 * category moving inside itself, which would break the category tree.
 */
export const validateMerchantCategoryParentStep = createStep(
  "validate-merchant-category-parent",
  async (
    input: {
      merchant_id: ResolvedMerchantId
      category_id: string
      parent_category_id?: string | null
    },
    { container }
  ) => {
    if (!input.parent_category_id) {
      return new StepResponse(input.parent_category_id)
    }

    await assertMerchantOwns(
      container,
      "product_category",
      input.parent_category_id,
      input.merchant_id
    )

    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "product_category",
      fields: ["id", "mpath"],
      filters: { id: input.parent_category_id },
    })
    const parent = (data as unknown as Array<{ id: string; mpath: string }>)[0]

    if (parent && isOwnDescendant(input.category_id, parent)) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "A category can't be moved under itself or one of its subcategories"
      )
    }

    return new StepResponse(input.parent_category_id)
  }
)

/**
 * Turns the position a merchant dragged a category to (among their own
 * categories under its parent) into the rank Medusa stores.
 */
export const resolveMerchantCategoryRankStep = createStep(
  "resolve-merchant-category-rank",
  async (
    input: {
      merchant_id: ResolvedMerchantId
      category_id: string
      // Undefined keeps the current parent; null is the top level.
      parent_category_id?: string | null
      position?: number
    },
    { container }
  ) => {
    if (input.position === undefined) {
      return new StepResponse(undefined as number | undefined)
    }

    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "product_category",
      fields: ["id", "rank", "parent_category_id"],
      filters: { id: input.category_id },
    })
    const category = (data as unknown as Array<{
      id: string
      rank: number
      parent_category_id: string | null
    }>)[0]

    if (!category) {
      throw categoryNotFound()
    }

    const parentId =
      input.parent_category_id === undefined
        ? category.parent_category_id
        : input.parent_category_id
    const { data: siblingData } = await query.graph({
      entity: "product_category",
      fields: ["id", "rank"],
      filters: { parent_category_id: parentId },
    })
    const siblings = siblingData as unknown as Array<{ id: string; rank: number }>
    const ownedIds = new Set(
      await listMerchantOwnedIds(container, input.merchant_id, "product_category")
    )

    return new StepResponse(
      rankForPosition({
        category,
        parent_category_id: parentId,
        position: input.position,
        siblings: siblings.filter(({ id }) => ownedIds.has(id)),
        all_sibling_count: siblings.length,
      }) as number | undefined
    )
  }
)

export const validateMerchantCategoryDeletableStep = createStep(
  "validate-merchant-category-deletable",
  async (input: { category: MerchantCategoryDetail }) => {
    if (input.category.category_children.length) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        `${input.category.name} has subcategories. Move or delete them first.`
      )
    }

    return new StepResponse(input.category.id)
  }
)
