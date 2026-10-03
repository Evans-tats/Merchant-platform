import type { ProductCategoryWorkflow } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import {
  createWorkflow,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import {
  batchLinkProductsToCategoryWorkflow,
  createProductCategoriesWorkflow,
  createRemoteLinkStep,
  deleteProductCategoriesWorkflow,
  updateProductCategoriesWorkflow,
} from "@medusajs/medusa/core-flows"

import { MERCHANT_MODULE } from "../modules/merchant"
import { handleFromTitle } from "../services/merchant-handles"
import {
  listMerchantCategoriesStep,
  resolveMerchantCategoryRankStep,
  retrieveMerchantCategoryStep,
  validateMerchantCategoryDeletableStep,
  validateMerchantCategoryParentStep,
} from "./steps/merchant-categories"
import { resolveMerchantHandlesStep } from "./steps/resolve-merchant-handles"
import {
  type MerchantScopeInput,
  validateMerchantCategoryParentsStep,
  validateMerchantProductIdsStep,
  validateMerchantScopeStep,
} from "./steps/validate-merchant-commerce"

export type CreateMerchantCategoriesInput = MerchantScopeInput & {
  product_categories:
    ProductCategoryWorkflow.CreateProductCategoriesWorkflowInput["product_categories"]
}

type MerchantCategoryScope = MerchantScopeInput & {
  category_id: string
}

export type UpdateMerchantCategoryInput = MerchantCategoryScope & {
  update: {
    name?: string
    handle?: string
    description?: string
    is_active?: boolean
    is_internal?: boolean
    parent_category_id?: string | null
    // Position among the merchant's own categories under the parent.
    rank?: number
  }
}

export type ManageMerchantCategoryProductsInput = MerchantCategoryScope & {
  add?: string[]
  remove?: string[]
}

export const listMerchantCategoriesWorkflow = createWorkflow(
  "list-merchant-categories",
  function (input: MerchantScopeInput) {
    const scope = validateMerchantScopeStep(input)
    const categories = listMerchantCategoriesStep({
      merchant_id: scope.merchant_id,
    })

    return new WorkflowResponse(categories)
  }
)

export const retrieveMerchantCategoryWorkflow = createWorkflow(
  "retrieve-merchant-category",
  function (input: MerchantCategoryScope) {
    const scope = validateMerchantScopeStep(input)
    const category = retrieveMerchantCategoryStep({
      merchant_id: scope.merchant_id,
      category_id: input.category_id,
    })

    return new WorkflowResponse(category)
  }
)

export const createMerchantCategoriesWorkflow = createWorkflow(
  "create-merchant-categories",
  function (input: CreateMerchantCategoriesInput) {
    const scope = validateMerchantScopeStep(input)
    const parentCategoryIds = transform({ input }, ({ input }) => {
      return input.product_categories
        .map(({ parent_category_id }) => parent_category_id)
        .filter((id): id is string => Boolean(id))
    })

    validateMerchantCategoryParentsStep({
      scope,
      parent_category_ids: parentCategoryIds,
    })
    // Like Medusa, a category without a handle gets one from its name.
    const requestedHandles = transform({ input }, ({ input }) =>
      input.product_categories.map((category) => ({
        handle: category.handle || handleFromTitle(category.name, "category"),
      }))
    )
    const handles = resolveMerchantHandlesStep({
      merchant_id: scope.merchant_id,
      entity: "product_category",
      records: requestedHandles,
    })
    const categoriesInput = transform(
      { input, handles },
      ({ input, handles }) => ({
        product_categories: input.product_categories.map(
          (category, index) => ({
            ...category,
            handle: handles[index],
          })
        ),
      })
    )
    const categories = createProductCategoriesWorkflow.runAsStep({
      input: categoriesInput,
    })
    const categoryLinks = transform(
      { categories, scope },
      ({ categories, scope }) => {
        return categories.map((category) => ({
          [MERCHANT_MODULE]: {
            merchant_id: scope.merchant_id,
          },
          [Modules.PRODUCT]: {
            product_category_id: category.id,
          },
        }))
      }
    )

    createRemoteLinkStep(categoryLinks)

    return new WorkflowResponse(categories)
  }
)

export const updateMerchantCategoryWorkflow = createWorkflow(
  "update-merchant-category",
  function (input: UpdateMerchantCategoryInput) {
    const scope = validateMerchantScopeStep(input)

    retrieveMerchantCategoryStep({
      merchant_id: scope.merchant_id,
      category_id: input.category_id,
    })
    validateMerchantCategoryParentStep({
      merchant_id: scope.merchant_id,
      category_id: input.category_id,
      parent_category_id: input.update.parent_category_id,
    })
    // A name change keeps the current handle; only a new handle is checked.
    const requestedHandles = transform({ input }, ({ input }) =>
      input.update.handle
        ? [{ record_id: input.category_id, handle: input.update.handle }]
        : []
    )
    const handles = resolveMerchantHandlesStep({
      merchant_id: scope.merchant_id,
      entity: "product_category",
      records: requestedHandles,
    })
    const rank = resolveMerchantCategoryRankStep({
      merchant_id: scope.merchant_id,
      category_id: input.category_id,
      parent_category_id: input.update.parent_category_id,
      position: input.update.rank,
    })
    const updateInput = transform(
      { input, handles, rank },
      ({ input, handles, rank }) => ({
        selector: { id: input.category_id },
        update: {
          ...input.update,
          ...(handles[0] !== undefined && { handle: handles[0] }),
          // Replaces the merchant's position with Medusa's rank.
          ...(rank !== undefined && { rank }),
        },
      })
    )

    updateProductCategoriesWorkflow.runAsStep({ input: updateInput })

    const category = retrieveMerchantCategoryStep({
      merchant_id: scope.merchant_id,
      category_id: input.category_id,
    }).config({ name: "retrieve-updated-merchant-category" })

    return new WorkflowResponse(category)
  }
)

export const deleteMerchantCategoryWorkflow = createWorkflow(
  "delete-merchant-category",
  function (input: MerchantCategoryScope) {
    const scope = validateMerchantScopeStep(input)
    const category = retrieveMerchantCategoryStep({
      merchant_id: scope.merchant_id,
      category_id: input.category_id,
    })

    // Medusa refuses to delete a category that still has subcategories; this
    // says so in words the merchant can act on.
    validateMerchantCategoryDeletableStep({ category })

    const deleteInput = transform({ input }, ({ input }) => [input.category_id])

    deleteProductCategoriesWorkflow.runAsStep({ input: deleteInput })

    const result = transform({ input }, ({ input }) => ({
      id: input.category_id,
      object: "product_category",
      deleted: true,
    }))

    return new WorkflowResponse(result)
  }
)

export const manageMerchantCategoryProductsWorkflow = createWorkflow(
  "manage-merchant-category-products",
  function (input: ManageMerchantCategoryProductsInput) {
    const scope = validateMerchantScopeStep(input)
    const current = retrieveMerchantCategoryStep({
      merchant_id: scope.merchant_id,
      category_id: input.category_id,
    })
    const changes = transform({ input, current }, ({ input, current }) => {
      const members = new Set(current.products.map(({ id }) => id))

      return {
        add: Array.from(new Set(input.add ?? [])).filter(
          (id) => !members.has(id)
        ),
        remove: Array.from(new Set(input.remove ?? [])).filter((id) =>
          members.has(id)
        ),
      }
    })

    validateMerchantProductIdsStep({
      scope,
      product_ids: changes.add,
    })
    const linkInput = transform({ input, changes }, ({ input, changes }) => ({
      id: input.category_id,
      add: changes.add,
      remove: changes.remove,
    }))

    batchLinkProductsToCategoryWorkflow.runAsStep({ input: linkInput })

    const category = retrieveMerchantCategoryStep({
      merchant_id: scope.merchant_id,
      category_id: input.category_id,
    }).config({ name: "retrieve-managed-merchant-category" })

    return new WorkflowResponse(category)
  }
)
