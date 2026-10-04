import type {
  CreateProductWorkflowInputDTO,
  ProductTypes,
  UpdateProductVariantWorkflowInputDTO,
} from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
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
  attachInventoryItemToVariants,
  createInventoryItemsStep,
  createShippingProfilesWorkflow,
  createProductsWorkflow,
  createRemoteLinkStep,
  uploadFilesWorkflow,
  updateProductsWorkflow,
  useQueryGraphStep,
} from "@medusajs/medusa/core-flows"

import { MERCHANT_MODULE } from "../modules/merchant"
import type { ResolvedMerchantId } from "../services/tenant-resolution"
import { resolveStaffMerchant } from "../services/tenant-resolution"
import {
  type MerchantScopeInput,
  validateMerchantProductReferencesStep,
  validateMerchantResourceStep,
  validateMerchantScopeStep,
} from "./steps/validate-merchant-commerce"
import { describeProductPhotoStep } from "./steps/describe-product-photo"

type UpdateMerchantProductInput = MerchantScopeInput & {
  product_id: string
  update: Omit<ProductTypes.UpdateProductDTO, "variants"> & {
    variants?: UpdateProductVariantWorkflowInputDTO[]
    shipping_profile_id?: string | null
  }
}

type MerchantProductReadInput = MerchantScopeInput & {
  product_id?: string
}

export type ListMerchantProductsInput = MerchantScopeInput & {
  q?: string
  status?: "draft" | "proposed" | "published" | "rejected"
  limit: number
  offset: number
  order: "created_at" | "-created_at" | "title" | "-title"
}

type MerchantCatalogMutationActor = {
  actor_id: string
}

type MerchantProductListGraph = {
  products?: Array<Record<string, unknown>>
}

type ManagedVariantWithoutInventory = {
  id: string
  title: string
  sku?: string | null
}

type ProductPricingVariant = {
  id?: string
  title?: string
  prices?: Array<{
    amount?: unknown
    currency_code?: string | null
  }>
}

type ProductPricingValidationInput = {
  products: unknown[]
}

type ProductPricingProduct = {
  id?: string
  title?: string
  status?: string
  variants?: ProductPricingVariant[]
}

type ExistingProductPricing = {
  id: string
  title: string
  status: string
  variants?: Array<{
    id: string
    title: string
    prices?: Array<{
      amount: unknown
      currency_code: string
    }>
  }>
}

type CreateProductVariantInput =
  NonNullable<CreateProductWorkflowInputDTO["variants"]>[number]

export type CreateMerchantProductInput =
  Omit<CreateProductWorkflowInputDTO, "variants"> & {
    variants?: Array<CreateProductVariantInput & {
      // Product image URLs to show when a shopper picks this variant.
      image_urls?: string[]
    }>
  }

export type CreateMerchantProductsInput = MerchantScopeInput & {
  products: CreateMerchantProductInput[]
}

type VariantImageLinkRequest = {
  product_index: number
  variant_title: string
  options: Record<string, string>
  image_urls: string[]
}

type VariantImageProductGraph = {
  id: string
  images?: Array<{ id: string; url: string } | null>
  variants?: Array<{
    id: string
    options?: Array<{
      value: string
      option?: { title: string } | null
    } | null>
  } | null>
}

export type CreateMerchantShippingProfilesInput = MerchantScopeInput & {
  shipping_profiles: Array<{ name: string; type: string }>
}

type MerchantProductMediaFile = {
  filename: string
  mimeType: string
  content: string
  size: number
}

export type UploadMerchantProductMediaInput = MerchantScopeInput &
  MerchantCatalogMutationActor & {
    files: MerchantProductMediaFile[]
  }

export type GenerateProductDraftFromPhotoInput = MerchantScopeInput &
  MerchantCatalogMutationActor & {
    files: MerchantProductMediaFile[]
  }

type MerchantCategoryChoicesGraph = {
  product_categories?: Array<{ id: string; name: string } | null>
}

const supportedProductImageTypes = new Set([
  "image/avif",
  "image/jpeg",
  "image/png",
  "image/webp",
])

const maxProductImageSize = 10 * 1024 * 1024

const findManagedVariantsWithoutInventoryStep = createStep(
  "find-managed-variants-without-inventory",
  async (input: { product_ids: string[] }, { container }) => {
    if (!input.product_ids.length) {
      return new StepResponse([] as ManagedVariantWithoutInventory[])
    }

    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "product_variant",
      fields: [
        "id",
        "title",
        "sku",
        "manage_inventory",
        "inventory.id",
      ],
      filters: { product_id: input.product_ids },
    })
    const variants = data as unknown as Array<
      ManagedVariantWithoutInventory & {
        manage_inventory: boolean
        inventory?: Array<{ id: string }>
      }
    >

    return new StepResponse(
      variants
        .filter(
          ({ manage_inventory, inventory }) =>
            manage_inventory && !inventory?.length
        )
        .map(({ id, title, sku }) => ({ id, title, sku }))
    )
  }
)

const provisionManagedVariantInventory = (
  products: Array<{ id: string }>
) => {
  const productIds = transform({ products }, ({ products }) => ({
    product_ids: products.map(({ id }) => id),
  }))
  const variants = findManagedVariantsWithoutInventoryStep(productIds)
  const inventoryInput = transform({ variants }, ({ variants }) =>
    variants.map(({ title, sku }) => ({
      title,
      sku: sku ?? null,
      requires_shipping: true,
    }))
  )
  const inventoryItems = createInventoryItemsStep(inventoryInput)
  const links = transform(
    { variants, inventoryItems },
    ({ variants, inventoryItems }) =>
      variants.map((variant, index) => ({
        inventoryItemId: inventoryItems[index].id,
        tag: variant.id,
      }))
  )

  attachInventoryItemToVariants(links)
}

const listMerchantProductsStep = createStep(
  "list-merchant-products",
  async (
    input: {
      merchant_id: ResolvedMerchantId
      q?: string
      status?: "draft" | "proposed" | "published" | "rejected"
      limit: number
      offset: number
      order: "created_at" | "-created_at" | "title" | "-title"
    },
    { container }
  ) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data: merchantData } = await query.graph({
      entity: "merchant",
      fields: ["products.id"],
      filters: { id: input.merchant_id },
    })
    const merchant = (merchantData as unknown as MerchantProductListGraph[])[0]
    const productIds = (merchant?.products ?? []).map(({ id }) => String(id))

    if (!productIds.length) {
      return new StepResponse({
        products: [] as Array<Record<string, unknown>>,
        count: 0,
        limit: input.limit,
        offset: input.offset,
      })
    }

    const filters: Record<string, unknown> = { id: productIds }
    if (input.q) {
      filters.q = input.q
    }
    if (input.status) {
      filters.status = input.status
    }
    const descending = input.order.startsWith("-")
    const orderField = input.order.replace(/^-/, "")
    const { data: products, metadata } = await query.graph({
      entity: "product",
      fields: [
        "id",
        "title",
        "handle",
        "status",
        "thumbnail",
        "collection.id",
        "collection.title",
        "variants.id",
        "variants.sku",
        "variants.prices.id",
        "variants.prices.amount",
        "variants.prices.currency_code",
        "created_at",
        "updated_at",
      ],
      filters,
      pagination: {
        skip: input.offset,
        take: input.limit,
        order: { [orderField]: descending ? "DESC" : "ASC" },
      },
    })

    return new StepResponse({
      products,
      count: metadata?.count ?? products.length,
      limit: input.limit,
      offset: input.offset,
    })
  }
)

const merchantProductDetailFields = [
  "id",
  "title",
  "subtitle",
  "description",
  "handle",
  "status",
  "thumbnail",
  "discountable",
  "collection_id",
  "collection.id",
  "collection.title",
  "categories.id",
  "categories.name",
  "images.id",
  "images.url",
  "images.rank",
  "options.id",
  "options.title",
  "options.values.id",
  "options.values.value",
  "variants.id",
  "variants.title",
  "variants.sku",
  "variants.manage_inventory",
  "variants.allow_backorder",
  "variants.prices.id",
  "variants.prices.amount",
  "variants.prices.currency_code",
  "variants.options.id",
  "variants.options.value",
  "variants.options.option_id",
  "variants.inventory.id",
  "variants.inventory.location_levels.id",
  "variants.inventory.location_levels.location_id",
  "variants.inventory.location_levels.stocked_quantity",
  "variants.inventory.location_levels.reserved_quantity",
  "variants.inventory.location_levels.incoming_quantity",
  "variants.inventory.location_levels.available_quantity",
  "shipping_profile.id",
  "shipping_profile.name",
  "sales_channels.id",
  "created_at",
  "updated_at",
]

const validateMerchantCatalogMutationAccessStep = createStep(
  "validate-merchant-catalog-mutation-access",
  async (
    input: MerchantScopeInput & MerchantCatalogMutationActor,
    { container }
  ) => {
    const context = await resolveStaffMerchant(
      container,
      input.actor_id,
      input.merchant_id,
      { allowed_roles: ["owner", "admin"] }
    )

    if (context.salesChannel.id !== input.sales_channel_id) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        "Merchant commerce scope not found"
      )
    }

    return new StepResponse({
      merchant_id: context.merchant.id,
      sales_channel_id: context.salesChannel.id,
    })
  }
)

const validateMerchantProductMediaStep = createStep(
  "validate-merchant-product-media",
  async (input: { files: MerchantProductMediaFile[] }) => {
    if (!input.files.length) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Upload at least one product image"
      )
    }

    if (input.files.length > 20) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "A product can have up to 20 images"
      )
    }

    for (const file of input.files) {
      if (!supportedProductImageTypes.has(file.mimeType)) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `${file.filename} is not a supported product image`
        )
      }

      if (file.size <= 0 || file.size > maxProductImageSize) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `${file.filename} must be between 1 byte and 10 MB`
        )
      }

      if (!file.content) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `${file.filename} has no content`
        )
      }
    }

    return new StepResponse(input.files)
  }
)

const listMerchantCategoryChoicesStep = createStep(
  "list-merchant-category-choices",
  async (input: { merchant_id: string }, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "merchant",
      fields: ["id", "product_categories.id", "product_categories.name"],
      filters: { id: input.merchant_id },
    })
    const merchant = (data as unknown as MerchantCategoryChoicesGraph[])[0]

    return new StepResponse(
      (merchant?.product_categories ?? [])
        .filter((category): category is { id: string; name: string } =>
          Boolean(category?.id && category.name)
        )
        .map(({ id, name }) => ({ id, name }))
    )
  }
)

const validateMerchantPublishedProductPricesStep = createStep(
  "validate-merchant-published-product-prices",
  async (input: ProductPricingValidationInput, { container }) => {
    const productInputs = input.products as ProductPricingProduct[]
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data: regionData } = await query.graph({
      entity: "region",
      fields: ["currency_code"],
    })
    const requiredCurrencies = Array.from(new Set(
      (regionData as unknown as Array<{ currency_code: string }>)
        .map(({ currency_code }) => currency_code.toLowerCase())
    ))
    const productIds = productInputs
      .map(({ id }) => id)
      .filter((id): id is string => Boolean(id))
    let existingProducts: ExistingProductPricing[] = []

    if (productIds.length) {
      const { data } = await query.graph({
        entity: "product",
        fields: [
          "id",
          "title",
          "status",
          "variants.id",
          "variants.title",
          "variants.prices.amount",
          "variants.prices.currency_code",
        ],
        filters: { id: productIds },
      })
      existingProducts = data as unknown as ExistingProductPricing[]
    }

    for (const productInput of productInputs) {
      const existingProduct = existingProducts.find(({ id }) => {
        return id === productInput.id
      })
      const status = productInput.status ?? existingProduct?.status

      if (status !== "published") continue

      if (!requiredCurrencies.length) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          "Configure at least one store region before publishing products"
        )
      }

      const submittedVariants = productInput.variants ?? []
      const variants: ProductPricingVariant[] = existingProduct
        ? (existingProduct.variants ?? []).map((existingVariant) => {
            return submittedVariants.find(({ id }) => {
              return id === existingVariant.id
            }) ?? existingVariant
          })
        : submittedVariants

      for (const submittedVariant of submittedVariants) {
        if (!variants.some(({ id }) => id === submittedVariant.id)) {
          variants.push(submittedVariant)
        }
      }

      for (const variant of variants) {
        const existingVariant = existingProduct?.variants?.find(({ id }) => {
          return id === variant.id
        })
        const prices = variant.prices ?? existingVariant?.prices ?? []
        const validCurrencies = new Set(prices.flatMap((price) => {
          const currencyCode = price.currency_code?.toLowerCase()
          const amount = Number(price.amount)

          return currencyCode && Number.isFinite(amount) && amount >= 0
            ? [currencyCode]
            : []
        }))
        const missingCurrencies = requiredCurrencies.filter((currencyCode) => {
          return !validCurrencies.has(currencyCode)
        })

        if (missingCurrencies.length) {
          const productName = productInput.title ?? existingProduct?.title ?? "Product"
          throw new MedusaError(
            MedusaError.Types.INVALID_DATA,
            `${productName} variant ${variant.title ?? variant.id ?? "Default"} needs ${missingCurrencies.map((code) => code.toUpperCase()).join(", ")} pricing before it can be published`
          )
        }
      }
    }

    return new StepResponse(input.products)
  }
)

// Checks variant photos before anything is created, so a bad photo reference
// fails the request instead of rolling back a half-created product.
const validateMerchantVariantImagesStep = createStep(
  "validate-merchant-variant-images",
  async (input: { products: CreateMerchantProductInput[] }) => {
    const requests: VariantImageLinkRequest[] = []

    input.products.forEach((product, productIndex) => {
      const productImageUrls = new Set(
        (product.images ?? []).map(({ url }) => url)
      )

      for (const variant of product.variants ?? []) {
        const imageUrls = Array.from(new Set(variant.image_urls ?? []))
        if (!imageUrls.length) continue

        if (imageUrls.some((url) => !productImageUrls.has(url))) {
          throw new MedusaError(
            MedusaError.Types.INVALID_DATA,
            `Photos for ${product.title ?? "the product"} variant ${variant.title} must be images of the product`
          )
        }

        requests.push({
          product_index: productIndex,
          variant_title: variant.title,
          options: variant.options ?? {},
          image_urls: imageUrls,
        })
      }
    })

    return new StepResponse(requests)
  }
)

const variantHasOptions = (
  variant: NonNullable<NonNullable<VariantImageProductGraph["variants"]>[number]>,
  options: Record<string, string>
) => {
  const variantOptions = new Map(
    (variant.options ?? []).flatMap((entry) =>
      entry?.option?.title ? [[entry.option.title, entry.value] as const] : []
    )
  )
  const expected = Object.entries(options)

  return (
    expected.length === variantOptions.size &&
    expected.every(([title, value]) => variantOptions.get(title) === value)
  )
}

const linkMerchantVariantImagesStep = createStep(
  "link-merchant-variant-images",
  async (
    input: { product_ids: string[]; requests: VariantImageLinkRequest[] },
    { container }
  ) => {
    if (!input.requests.length) {
      return new StepResponse([], [] as Array<{ image_id: string; variant_id: string }>)
    }

    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "product",
      fields: [
        "id",
        "images.id",
        "images.url",
        "variants.id",
        "variants.options.value",
        "variants.options.option.title",
      ],
      filters: { id: input.product_ids },
    })
    const products = data as unknown as VariantImageProductGraph[]
    const links = input.requests.flatMap((request) => {
      const product = products.find(({ id }) => {
        return id === input.product_ids[request.product_index]
      })
      const variant = product?.variants?.find((candidate) => {
        return candidate ? variantHasOptions(candidate, request.options) : false
      })

      if (!product || !variant) {
        throw new MedusaError(
          MedusaError.Types.UNEXPECTED_STATE,
          `Couldn't attach photos to variant ${request.variant_title}`
        )
      }

      return request.image_urls.flatMap((url) => {
        const image = product.images?.find((entry) => entry?.url === url)
        return image ? [{ image_id: image.id, variant_id: variant.id }] : []
      })
    })

    if (links.length) {
      await container.resolve(Modules.PRODUCT).addImageToVariant(links)
    }

    return new StepResponse(links, links)
  },
  async (links, { container }) => {
    if (!links?.length) {
      return
    }

    await container.resolve(Modules.PRODUCT).removeImageFromVariant(links)
  }
)

export const createMerchantProductsWorkflow = createWorkflow(
  "create-merchant-products",
  function (input: CreateMerchantProductsInput) {
    const scope = validateMerchantScopeStep(input)

    validateMerchantProductReferencesStep({
      scope,
      products: input.products,
    })
    const variantImageRequests = validateMerchantVariantImagesStep({
      products: input.products,
    })
    const validatedProducts = validateMerchantPublishedProductPricesStep({
      products: input.products,
    })

    const productsInput = transform(
      { validatedProducts, scope },
      ({ validatedProducts, scope }) => {
        const products = validatedProducts as CreateMerchantProductInput[]
        return {
          products: products.map(({ variants, ...product }) => ({
            ...product,
            // image_urls is linked after creation; the product module
            // doesn't accept it on variants.
            ...(variants && {
              variants: variants.map(({ image_urls: _imageUrls, ...variant }) => {
                return variant
              }),
            }),
            sales_channels: [{ id: scope.sales_channel_id }],
            shipping_profile_id:
              product.shipping_profile_id ?? scope.shipping_profile_id,
          })),
        }
      }
    )
    const products = createProductsWorkflow.runAsStep({
      input: productsInput,
    })
    const productLinks = transform(
      { products, scope },
      ({ products, scope }) => {
        return products.map((product) => ({
          [MERCHANT_MODULE]: {
            merchant_id: scope.merchant_id,
          },
          [Modules.PRODUCT]: {
            product_id: product.id,
          },
        }))
      }
    )

    createRemoteLinkStep(productLinks)
    const variantImageLinkInput = transform(
      { products, variantImageRequests },
      ({ products, variantImageRequests }) => ({
        product_ids: products.map(({ id }) => id),
        requests: variantImageRequests,
      })
    )
    linkMerchantVariantImagesStep(variantImageLinkInput)
    provisionManagedVariantInventory(products)

    return new WorkflowResponse(products)
  }
)

export const updateMerchantProductWorkflow = createWorkflow(
  "update-merchant-product",
  function (input: UpdateMerchantProductInput) {
    const scope = validateMerchantScopeStep(input)

    validateMerchantResourceStep({
      scope,
      resource_type: "product",
      resource_id: input.product_id,
    })
    validateMerchantProductReferencesStep({
      scope,
      products: [input.update],
    })
    const pricingInput = transform({ input }, ({ input }) => ({
      products: [{
        ...input.update,
        id: input.product_id,
      }],
    }))
    const validatedProducts = validateMerchantPublishedProductPricesStep(
      pricingInput
    )

    const updateInput = transform(
      { validatedProducts, scope },
      ({ validatedProducts, scope }) => {
        const { shipping_profile_id: shippingProfileId, ...product } =
          validatedProducts[0] as UpdateMerchantProductInput["update"] & {
            id: string
          }

        // Only touch the shipping profile when the update includes it, so
        // edits to other sections keep the product's current profile.
        return {
          products: [
            {
              ...product,
              sales_channels: [{ id: scope.sales_channel_id }],
              ...(shippingProfileId !== undefined && {
                shipping_profile_id:
                  shippingProfileId ?? scope.shipping_profile_id,
              }),
            },
          ],
        }
      }
    )
    const products = updateProductsWorkflow.runAsStep({
      input: updateInput,
    })
    provisionManagedVariantInventory(products)

    return new WorkflowResponse(products)
  }
)

export const createMerchantProductsFromAdminWorkflow = createWorkflow(
  "create-merchant-products-from-admin",
  function (
    input: CreateMerchantProductsInput & MerchantCatalogMutationActor
  ) {
    const scope = validateMerchantCatalogMutationAccessStep(input)
    const workflowInput = transform({ input, scope }, ({ input, scope }) => ({
      merchant_id: scope.merchant_id,
      sales_channel_id: scope.sales_channel_id,
      products: input.products,
    }))
    const products = createMerchantProductsWorkflow.runAsStep({
      input: workflowInput,
    })

    return new WorkflowResponse(products)
  }
)

export const updateMerchantProductFromAdminWorkflow = createWorkflow(
  "update-merchant-product-from-admin",
  function (input: UpdateMerchantProductInput & MerchantCatalogMutationActor) {
    const scope = validateMerchantCatalogMutationAccessStep(input)
    const workflowInput = transform({ input, scope }, ({ input, scope }) => ({
      merchant_id: scope.merchant_id,
      sales_channel_id: scope.sales_channel_id,
      product_id: input.product_id,
      update: input.update,
    }))
    const products = updateMerchantProductWorkflow.runAsStep({
      input: workflowInput,
    })

    return new WorkflowResponse(products)
  }
)

export const uploadMerchantProductMediaFromAdminWorkflow = createWorkflow(
  "upload-merchant-product-media-from-admin",
  function (input: UploadMerchantProductMediaInput) {
    validateMerchantCatalogMutationAccessStep(input)
    const validatedFiles = validateMerchantProductMediaStep({
      files: input.files,
    })
    const uploadInput = transform(
      { validatedFiles },
      ({ validatedFiles }) => ({
        files: validatedFiles.map((file) => ({
          filename: file.filename,
          mimeType: file.mimeType,
          content: file.content,
          access: "public" as const,
        })),
      })
    )
    const files = uploadFilesWorkflow.runAsStep({ input: uploadInput })

    return new WorkflowResponse(files)
  }
)

// Drafts listing details from up to five photos of one product. Nothing is
// uploaded or saved: the photos stay in the create form and are uploaded
// only if the merchant publishes the product.
export const generateProductDraftFromPhotoWorkflow = createWorkflow(
  "generate-product-draft-from-photo",
  function (input: GenerateProductDraftFromPhotoInput) {
    const scope = validateMerchantCatalogMutationAccessStep(input)
    const validatedFiles = validateMerchantProductMediaStep({
      files: input.files,
    })
    const categories = listMerchantCategoryChoicesStep({
      merchant_id: scope.merchant_id,
    })
    const describeInput = transform(
      { validatedFiles, categories },
      ({ validatedFiles, categories }) => ({
        photos: validatedFiles.map(({ mimeType, content }) => ({
          mimeType,
          content,
        })),
        categories,
      })
    )
    const draft = describeProductPhotoStep(describeInput)

    return new WorkflowResponse(draft)
  }
)

export const listMerchantProductsWorkflow = createWorkflow(
  "list-merchant-products",
  function (input: ListMerchantProductsInput) {
    const scope = validateMerchantScopeStep(input)
    const products = listMerchantProductsStep({
      merchant_id: scope.merchant_id,
      q: input.q,
      status: input.status,
      limit: input.limit,
      offset: input.offset,
      order: input.order,
    })

    return new WorkflowResponse(products)
  }
)

export const retrieveMerchantProductWorkflow = createWorkflow(
  "retrieve-merchant-product",
  function (input: MerchantProductReadInput & { product_id: string }) {
    const scope = validateMerchantScopeStep(input)

    validateMerchantResourceStep({
      scope,
      resource_type: "product",
      resource_id: input.product_id,
    })
    const { data: products } = useQueryGraphStep({
      entity: "product",
      fields: merchantProductDetailFields,
      filters: { id: input.product_id },
      options: { throwIfKeyNotFound: true },
    })
    const product = transform({ products }, ({ products }) => products[0])

    return new WorkflowResponse(product)
  }
)

export const createMerchantShippingProfilesWorkflow = createWorkflow(
  "create-merchant-shipping-profiles",
  function (input: CreateMerchantShippingProfilesInput) {
    const scope = validateMerchantScopeStep(input)
    const profiles = createShippingProfilesWorkflow.runAsStep({
      input: { data: input.shipping_profiles },
    })
    const links = transform(
      { profiles, scope },
      ({ profiles, scope }) => profiles.map((profile) => ({
        [MERCHANT_MODULE]: { merchant_id: scope.merchant_id },
        [Modules.FULFILLMENT]: { shipping_profile_id: profile.id },
      }))
    )

    createRemoteLinkStep(links)

    return new WorkflowResponse(profiles)
  }
)
