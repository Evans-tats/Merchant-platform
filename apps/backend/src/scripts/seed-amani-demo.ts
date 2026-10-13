import type { ExecArgs, InventoryTypes } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils"
import {
  cancelOrderWorkflow,
  capturePaymentWorkflow,
  createOrderFulfillmentWorkflow,
  createOrderPaymentCollectionWorkflow,
  createOrderWorkflow,
  createPaymentSessionsWorkflow,
  createUsersWorkflow,
  markOrderFulfillmentAsDeliveredWorkflow,
} from "@medusajs/medusa/core-flows"

import { MERCHANT_MODULE } from "../modules/merchant"
import type MerchantModuleService from "../modules/merchant/service"
import { storefrontUrl } from "../services/storefront-url"
import type { ResolvedMerchantId } from "../services/tenant-resolution"
import { createMerchantCategoriesWorkflow } from "../workflows/merchant-categories"
import {
  createMerchantProductsWorkflow,
  updateMerchantProductWorkflow,
} from "../workflows/merchant-catalog"
import {
  createMerchantCustomerAddressWorkflow,
  createMerchantCustomerWorkflow,
} from "../workflows/merchant-customer"
import {
  createMerchantDeliveryMethodWorkflow,
  listMerchantDeliveryMethodsWorkflow,
} from "../workflows/merchant-delivery"
import { adjustMerchantInventoryWorkflow } from "../workflows/merchant-inventory"
import { listMerchantInventoryWorkflow } from "../workflows/merchant-insights"
import { provisionMerchantWorkflow } from "../workflows/provision-merchant"

const demoVersion = "amani-hackathon-v1"
const orderCount = 36
const platformDomain =
  process.env.MERCHANT_PLATFORM_DOMAIN?.trim() || "localhost"
const railwayBackendDomain = process.env.RAILWAY_PUBLIC_DOMAIN?.trim()
const backendUrl = (
  process.env.MEDUSA_BACKEND_URL?.trim() ||
  (railwayBackendDomain
    ? `https://${railwayBackendDomain}`
    : "http://localhost:9000")
).replace(/\/$/, "")
const ownerPassword = "demo123"

const amaniOwner = {
  email: "amina@test.local",
  first_name: "Amina",
  last_name: "Demo Owner",
  password: ownerPassword,
}

const categoryFixtures = [
  {
    name: "Baby Care",
    handle: "amani-baby-care",
    description: "Everyday baby hygiene and care essentials.",
  },
  {
    name: "Baking Essentials",
    handle: "amani-baking-essentials",
    description: "Flours, porridges, and pantry staples for the family.",
  },
  {
    name: "Cooking Oil",
    handle: "amani-cooking-oil",
    description: "Quality cooking oils for everyday meals.",
  },
  {
    name: "Dairy & Eggs",
    handle: "amani-dairy-and-eggs",
    description: "Fresh dairy products and breakfast essentials.",
  },
] as const

type CategoryName = (typeof categoryFixtures)[number]["name"]

const productFixtures = [
  {
    category: "Baby Care" as CategoryName,
    title: "Softcare Baby Wipes 80 Pieces",
    handle: "amani-softcare-baby-wipes-80-pieces",
    sku: "AMANI-SOFTCARE-WIPES-80",
    pack: "80 Pieces",
    price: 250,
    stock: 26,
    weight: 450,
    image: "baby-care/softcare-baby-wipes-80-pieces.jpg",
    description:
      "Soft, alcohol-free baby wipes for gentle everyday cleaning at home or on the go.",
  },
  {
    category: "Baby Care" as CategoryName,
    title: "Softcare Gold XL Baby Diapers",
    handle: "amani-softcare-gold-xl-baby-diapers",
    sku: "AMANI-SOFTCARE-DIAPERS-XL",
    pack: "XL 7 Pack",
    price: 220,
    stock: 3,
    weight: 600,
    image: "baby-care/softcare-low-count-diapers.jpg",
    description:
      "Softcare Gold extra-large baby diapers with absorbent protection for growing babies.",
  },
  {
    category: "Baking Essentials" as CategoryName,
    title: "Famila Strawberry Porridge Flour 1 kg",
    handle: "amani-famila-strawberry-porridge-flour-1kg",
    sku: "AMANI-FAMILA-STRAWBERRY-1KG",
    pack: "1 kg",
    price: 230,
    stock: 17,
    weight: 1000,
    image: "baking-essentials/famila-strawberry-porridge-flour-1kg.jpg",
    description:
      "Strawberry-flavoured porridge flour for a quick, warm, and family-friendly breakfast.",
  },
  {
    category: "Baking Essentials" as CategoryName,
    title: "Sainsbury's Golden Syrup Porridge",
    handle: "amani-sainsburys-golden-syrup-porridge",
    sku: "AMANI-SAINSBURYS-GOLDEN-SYRUP",
    pack: "8 Sachets",
    price: 650,
    stock: 11,
    weight: 300,
    image: "baking-essentials/sainsburys-golden-syrup-porridge.jpg",
    description:
      "Golden syrup flavoured porridge in convenient individual sachets, ready in minutes.",
  },
  {
    category: "Baking Essentials" as CategoryName,
    title: "Soko Pure Wimbi Porridge Flour 1 kg",
    handle: "amani-soko-pure-wimbi-porridge-flour-1kg",
    sku: "AMANI-SOKO-WIMBI-1KG",
    pack: "1 kg",
    price: 180,
    stock: 24,
    weight: 1000,
    image: "baking-essentials/soko-pure-wimbi-porridge-flour-1kg.jpg",
    description:
      "Pure wimbi porridge flour for a wholesome, traditional breakfast.",
  },
  {
    category: "Cooking Oil" as CategoryName,
    title: "Rinsun Sunflower Oil 3 L",
    handle: "amani-rinsun-sunflower-oil-3l",
    sku: "AMANI-RINSUN-SUNFLOWER-3L",
    pack: "3 L",
    price: 920,
    stock: 8,
    weight: 3000,
    image: "cooking-oil/rinsun-sunflower-oil-3l.webp",
    description:
      "Light sunflower cooking oil in a convenient family-size three-litre bottle.",
  },
  {
    category: "Dairy & Eggs" as CategoryName,
    title: "Brookside UHT Fino Milk 500 ml",
    handle: "amani-brookside-uht-fino-milk-500ml",
    sku: "AMANI-BROOKSIDE-FINO-500ML",
    pack: "500 ml",
    price: 95,
    stock: 19,
    weight: 500,
    image: "dairy-and-eggs/brookside-uht-fino-milk-500ml.avif",
    description:
      "Long-life Brookside Fino milk in a handy 500 ml carton for tea, cereal, and cooking.",
  },
  {
    category: "Dairy & Eggs" as CategoryName,
    title: "Fresh Eggs Tray of 30",
    handle: "amani-fresh-eggs-tray-30",
    sku: "AMANI-FRESH-EGGS-30",
    pack: "Tray of 30",
    price: 520,
    stock: 14,
    weight: 1800,
    image: "dairy-and-eggs/fresh-eggs-tray-30.jpg",
    description:
      "A full tray of 30 fresh eggs for breakfasts, baking, and family meals.",
  },
] as const

const customerFixtures = [
  ["Achieng", "Otieno", "Kilimani", "Ngong Road"],
  ["Wanjiku", "Kamau", "Westlands", "Muthangari Drive"],
  ["Brian", "Mwangi", "Kasarani", "Mwiki Road"],
  ["Faith", "Njeri", "South B", "Mchumbi Road"],
  ["Kevin", "Omondi", "Embakasi", "Airport North Road"],
  ["Mercy", "Wambui", "Ruaka", "Limuru Road"],
  ["David", "Kiptoo", "Langata", "Nairobi West Road"],
  ["Sharon", "Atieno", "Rongai", "Magadi Road"],
  ["James", "Mutua", "Donholm", "Savannah Road"],
  ["Lilian", "Chebet", "Parklands", "Third Parklands Avenue"],
  ["Peter", "Maina", "Umoja", "Moi Drive"],
  ["Esther", "Nyambura", "Lavington", "James Gichuru Road"],
  ["Samuel", "Odhiambo", "Buruburu", "Mumias South Road"],
  ["Grace", "Wairimu", "Kileleshwa", "Mandera Road"],
  ["Daniel", "Korir", "Roysambu", "Lumumba Drive"],
  ["Irene", "Akinyi", "Karen", "Karen Road"],
  ["Joseph", "Muriuki", "Zimmerman", "Kamiti Road"],
  ["Lucy", "Jepkemoi", "Pangani", "Murang'a Road"],
].map(([firstName, lastName, area, street], index) => ({
  email: `amani.customer${String(index + 1).padStart(2, "0")}@example.test`,
  first_name: firstName,
  last_name: lastName,
  phone: `+25470010${String(index + 1).padStart(4, "0")}`,
  area,
  street,
}))

type MerchantResources = {
  id: string
  primary_sales_channel?: { id: string } | null
  stock_locations?: Array<{ id: string }>
  shipping_profiles?: Array<{ id: string; type: string }>
}

type CategoryGraph = {
  id: string
  name: string
  handle: string
}

type ProductGraph = {
  id: string
  handle: string
  title: string
  thumbnail?: string | null
  variants?: Array<{
    id: string
    title: string
    sku?: string | null
    manage_inventory?: boolean
    allow_backorder?: boolean
    inventory?: Array<{
      id: string
      location_levels?: Array<{
        id: string
        location_id: string
        stocked_quantity?: number | null
        reserved_quantity?: number | null
        available_quantity?: number | null
      }>
    }>
  }>
}

type CustomerProfileGraph = {
  customer_id: string
  customer?: {
    id: string
    email?: string | null
  } | null
  addresses?: Array<{ id: string }>
}

type OrderGraph = {
  id: string
  status: string
  total: number
  created_at?: Date | string
  metadata?: Record<string, unknown> | null
  items?: Array<{ id: string; quantity: number }>
  payment_collections?: Array<{
    id: string
    payments?: Array<{
      id: string
      captured_at?: Date | string | null
      canceled_at?: Date | string | null
    }>
  }>
  fulfillments?: Array<{
    id: string
    delivered_at?: Date | string | null
    canceled_at?: Date | string | null
  }>
}

type OrderLifecycle = "delivered" | "paid" | "authorized" | "canceled"

const imageUrl = (path: string) => `${backendUrl}/static/amani/products/${path}`

const orderSeedKey = (index: number) =>
  `amani-order-${String(index + 1).padStart(3, "0")}`

function lifecycleFor(index: number): OrderLifecycle {
  if (index < 24) return "delivered"
  if (index < 30) return "paid"
  if (index < 34) return "authorized"
  return "canceled"
}

function placedAtFor(index: number) {
  const daysAgo = 29 - Math.floor((index * 29) / (orderCount - 1))
  const placedAt = new Date()

  placedAt.setUTCDate(placedAt.getUTCDate() - daysAgo)
  placedAt.setUTCHours(7 + ((index * 3) % 12), (index * 17) % 60, 0, 0)

  return placedAt
}

async function findOrCreateOwner(container: ExecArgs["container"]) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const userService = container.resolve(Modules.USER)
  const authService = container.resolve(Modules.AUTH)
  const [existingOwner] = await userService.listUsers({
    email: amaniOwner.email,
  })

  if (existingOwner) {
    logger.info(`Using existing Amani owner ${amaniOwner.email}`)
    return existingOwner
  }

  const {
    result: [owner],
  } = await createUsersWorkflow(container).run({
    input: {
      users: [
        {
          email: amaniOwner.email,
          first_name: amaniOwner.first_name,
          last_name: amaniOwner.last_name,
        },
      ],
    },
  })
  const { authIdentity, error } = await authService.register("emailpass", {
    body: {
      email: amaniOwner.email,
      password: amaniOwner.password,
    },
  })

  if (error || !authIdentity) {
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      `Could not register ${amaniOwner.email}: ${error ?? "unknown auth error"}`,
    )
  }

  await authService.updateAuthIdentities({
    id: authIdentity.id,
    app_metadata: {
      user_id: owner.id,
    },
  })

  return owner
}

async function retrieveMerchantResources(
  container: ExecArgs["container"],
  merchantId: string,
) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "merchant",
    fields: [
      "id",
      "primary_sales_channel.id",
      "stock_locations.id",
      "shipping_profiles.id",
      "shipping_profiles.type",
    ],
    filters: { id: merchantId },
  })
  const merchant = (data as unknown as MerchantResources[])[0]
  const shippingProfile = merchant?.shipping_profiles?.find(
    ({ type }) => type === "default",
  )
  const stockLocation = merchant?.stock_locations?.[0]

  if (
    !merchant?.primary_sales_channel?.id ||
    !shippingProfile?.id ||
    !stockLocation?.id
  ) {
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      "Amani merchant commerce resources are incomplete",
    )
  }

  return {
    merchantId: merchant.id,
    salesChannelId: merchant.primary_sales_channel.id,
    shippingProfileId: shippingProfile.id,
    stockLocationId: stockLocation.id,
  }
}

async function ensureMerchant(
  container: ExecArgs["container"],
  ownerId: string,
) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const merchantService =
    container.resolve<MerchantModuleService>(MERCHANT_MODULE)
  const [existingMerchant] = await merchantService.listMerchants({
    slug: "amani",
  })

  if (existingMerchant) {
    logger.info("Using existing Amani merchant")
    return retrieveMerchantResources(container, existingMerchant.id)
  }

  const { result } = await provisionMerchantWorkflow(container).run({
    input: {
      name: "Amani Mini Mart",
      slug: "amani",
      platform_hostname: `amani.${platformDomain}`,
      owner_actor_id: ownerId,
      payment_provider: "mpesa_stk",
      payment_public_configuration: {
        display_name: "M-PESA",
        instructions: "Pay securely with M-PESA at checkout.",
      },
      theme_configuration: {
        branding: {
          name: "Amani Mini Mart",
          primary_color: "#166534",
          accent_color: "#f59e0b",
          description:
            "Everyday family essentials at friendly neighbourhood prices.",
        },
        pages: {
          about: {
            slug: "about",
            title: "About Amani",
            navigation_label: "About",
            show_in_navigation: true,
            content:
              "Amani Mini Mart is your convenient neighbourhood shop for trusted household and family essentials.",
          },
        },
      },
    },
  })

  logger.info("Provisioned Amani Mini Mart")
  return retrieveMerchantResources(container, result.merchant.id)
}

async function ensureCategories(
  container: ExecArgs["container"],
  merchantId: string,
  salesChannelId: string,
) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const loadCategories = async () => {
    const { data } = await query.graph({
      entity: "merchant",
      fields: [
        "product_categories.id",
        "product_categories.name",
        "product_categories.handle",
      ],
      filters: { id: merchantId },
    })

    return (
      (data[0] as unknown as { product_categories?: CategoryGraph[] })
        ?.product_categories ?? []
    )
  }
  const existing = await loadCategories()
  const existingNames = new Set(existing.map(({ name }) => name))
  const missing = categoryFixtures.filter(
    ({ name }) => !existingNames.has(name),
  )

  if (missing.length) {
    await createMerchantCategoriesWorkflow(container).run({
      input: {
        merchant_id: merchantId,
        sales_channel_id: salesChannelId,
        product_categories: missing.map((category) => ({
          name: category.name,
          handle: category.handle,
          description: category.description,
          is_active: true,
          is_internal: false,
          metadata: {
            demo_version: demoVersion,
          },
        })),
      },
    })
    logger.info(`Created ${missing.length} Amani product categories`)
  }

  const categories = await loadCategories()
  const categoryIds = new Map(categories.map(({ id, name }) => [name, id]))

  for (const fixture of categoryFixtures) {
    if (!categoryIds.has(fixture.name)) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `Amani category ${fixture.name} is missing after seeding`,
      )
    }
  }

  return categoryIds
}

async function ensureProducts(
  container: ExecArgs["container"],
  merchantId: string,
  salesChannelId: string,
  categoryIds: Map<string, string>,
) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const loadProducts = async () => {
    const { data } = await query.graph({
      entity: "merchant",
      fields: [
        "products.id",
        "products.handle",
        "products.title",
        "products.thumbnail",
        "products.variants.id",
        "products.variants.title",
        "products.variants.sku",
        "products.variants.manage_inventory",
        "products.variants.allow_backorder",
        "products.variants.inventory.id",
      ],
      filters: { id: merchantId },
    })

    return (data[0] as unknown as { products?: ProductGraph[] })?.products ?? []
  }
  const existing = await loadProducts()
  const existingHandles = new Set(existing.map(({ handle }) => handle))
  const missing = productFixtures.filter(
    ({ handle }) => !existingHandles.has(handle),
  )

  if (missing.length) {
    await createMerchantProductsWorkflow(container).run({
      input: {
        merchant_id: merchantId,
        sales_channel_id: salesChannelId,
        products: missing.map((product) => {
          const productImage = imageUrl(product.image)

          return {
            title: product.title,
            handle: product.handle,
            description: product.description,
            status: "published",
            weight: product.weight,
            thumbnail: productImage,
            images: [{ url: productImage }],
            category_ids: [categoryIds.get(product.category)!],
            metadata: {
              demo_version: demoVersion,
              source_category: product.category,
            },
            options: [
              {
                title: "Pack",
                values: [product.pack],
              },
            ],
            variants: [
              {
                title: product.pack,
                sku: product.sku,
                manage_inventory: false,
                allow_backorder: true,
                options: { Pack: product.pack },
                prices: [
                  {
                    amount: product.price,
                    currency_code: "kes",
                  },
                ],
              },
            ],
          }
        }),
      },
    })
    logger.info(`Created ${missing.length} Amani products with supplied photos`)
  }

  const products = await loadProducts()
  const productByHandle = new Map(
    products.map((product) => [product.handle, product]),
  )

  for (const fixture of productFixtures) {
    const product = productByHandle.get(fixture.handle)

    if (!product?.variants?.[0]?.id) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `Amani product ${fixture.title} is missing a purchasable variant`,
      )
    }
  }

  return productByHandle
}

async function ensureInventory(
  container: ExecArgs["container"],
  resources: Awaited<ReturnType<typeof retrieveMerchantResources>>,
  products: Map<string, ProductGraph>,
) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  for (const fixture of productFixtures) {
    const product = products.get(fixture.handle)
    const variant = product?.variants?.[0]

    if (!product || !variant) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `Amani product ${fixture.title} is missing its variant`,
      )
    }

    if (
      variant.manage_inventory !== true ||
      variant.allow_backorder !== false ||
      !variant.inventory?.length
    ) {
      await updateMerchantProductWorkflow(container).run({
        input: {
          merchant_id: resources.merchantId,
          sales_channel_id: resources.salesChannelId,
          product_id: product.id,
          update: {
            variants: [
              {
                id: variant.id,
                manage_inventory: true,
                allow_backorder: false,
              },
            ],
          },
        },
      })
    }
  }

  const { data } = await query.graph({
    entity: "merchant",
    fields: [
      "products.id",
      "products.handle",
      "products.title",
      "products.variants.id",
      "products.variants.title",
      "products.variants.sku",
      "products.variants.manage_inventory",
      "products.variants.allow_backorder",
      "products.variants.inventory.id",
      "products.variants.inventory.location_levels.id",
      "products.variants.inventory.location_levels.location_id",
      "products.variants.inventory.location_levels.stocked_quantity",
      "products.variants.inventory.location_levels.reserved_quantity",
      "products.variants.inventory.location_levels.available_quantity",
    ],
    filters: { id: resources.merchantId },
  })
  const stockedProducts =
    (data[0] as unknown as { products?: ProductGraph[] })?.products ?? []
  const byHandle = new Map(
    stockedProducts.map((product) => [product.handle, product]),
  )
  const create: InventoryTypes.CreateInventoryLevelInput[] = []
  const update: InventoryTypes.UpdateInventoryLevelInput[] = []

  for (const fixture of productFixtures) {
    const product = byHandle.get(fixture.handle)
    const variant = product?.variants?.[0]
    const inventoryItem = variant?.inventory?.[0]

    if (!variant?.manage_inventory || !inventoryItem) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `Amani inventory was not provisioned for ${fixture.title}`,
      )
    }

    const level = inventoryItem.location_levels?.find(
      ({ location_id }) => location_id === resources.stockLocationId,
    )
    const inventoryLevel = {
      inventory_item_id: inventoryItem.id,
      location_id: resources.stockLocationId,
      stocked_quantity: fixture.stock,
    }

    if (level) {
      update.push({ id: level.id, ...inventoryLevel })
    } else {
      create.push(inventoryLevel)
    }
  }

  await adjustMerchantInventoryWorkflow(container).run({
    input: {
      merchant_id: resources.merchantId,
      sales_channel_id: resources.salesChannelId,
      create,
      update,
    },
  })

  const { result: inventory } = await listMerchantInventoryWorkflow(
    container,
  ).run({
    input: {
      merchant_id: resources.merchantId,
      sales_channel_id: resources.salesChannelId,
    },
  })
  const inventoryItems = inventory.inventory_items as Array<{
    sku?: string | null
    product: { title: string }
    location_levels: Array<{
      stocked_quantity?: number | null
      reserved_quantity?: number | null
      available_quantity?: number | null
    }>
  }>
  const actualStock = new Map(
    inventoryItems.map((item) => [
      item.sku,
      item.location_levels.reduce((total, level) => {
        return (
          total +
          Number(
            level.available_quantity ??
              Number(level.stocked_quantity ?? 0) -
                Number(level.reserved_quantity ?? 0),
          )
        )
      }, 0),
    ]),
  )

  for (const fixture of productFixtures) {
    if (actualStock.get(fixture.sku) !== fixture.stock) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `Amani stock verification failed for ${fixture.title}`,
      )
    }
  }

  const lowStock = inventoryItems.filter(
    (item) => Number(actualStock.get(item.sku) ?? 0) <= 5,
  )

  if (
    inventoryItems.length !== productFixtures.length ||
    lowStock.length !== 1 ||
    lowStock[0].sku !== "AMANI-SOFTCARE-DIAPERS-XL"
  ) {
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      "Amani must have exactly one low-stock demo product",
    )
  }

  logger.info(
    `Stocked ${inventoryItems.length} Amani variants; ${lowStock[0].product.title} is low at ${actualStock.get(lowStock[0].sku)} units`,
  )
}

async function ensureDeliveryMethod(
  container: ExecArgs["container"],
  resources: Awaited<ReturnType<typeof retrieveMerchantResources>>,
) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const { result: existing } = await listMerchantDeliveryMethodsWorkflow(
    container,
  ).run({
    input: {
      merchant_id: resources.merchantId,
      sales_channel_id: resources.salesChannelId,
    },
  })
  const deliveryResources = existing as unknown as {
    delivery_options: Array<{
      id: string
      name: string
      is_default: boolean
      price?: { amount: number; currency_code: string } | null
    }>
  }
  const current =
    deliveryResources.delivery_options.find(({ name }) => {
      return name === "Nairobi Standard Delivery"
    }) ??
    deliveryResources.delivery_options.find(({ is_default }) => is_default)

  if (current) {
    return {
      id: current.id,
      name: current.name,
      amount: Number(current.price?.amount ?? 180),
    }
  }

  const { result } = await createMerchantDeliveryMethodWorkflow(container).run({
    input: {
      merchant_id: resources.merchantId,
      sales_channel_id: resources.salesChannelId,
      name: "Nairobi Standard Delivery",
      description: "Reliable delivery across Nairobi and surrounding areas.",
      estimated_delivery: "Same day or next day",
      stock_location_id: resources.stockLocationId,
      shipping_profile_id: resources.shippingProfileId,
      country_codes: ["ke"],
      price: {
        amount: 180,
        currency_code: "kes",
      },
      is_enabled: true,
      is_default: true,
    },
  })
  const option = (result as unknown as Array<{ id: string; name: string }>)[0]

  if (!option?.id) {
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      "Amani delivery method was not created",
    )
  }

  logger.info("Created Amani Nairobi delivery method")
  return {
    id: option.id,
    name: option.name,
    amount: 180,
  }
}

async function ensureCustomers(
  container: ExecArgs["container"],
  resources: Awaited<ReturnType<typeof retrieveMerchantResources>>,
  ownerId: string,
) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const loadProfiles = async () => {
    const { data } = await query.graph({
      entity: "merchant",
      fields: [
        "customer_profiles.customer_id",
        "customer_profiles.customer.id",
        "customer_profiles.customer.email",
        "customer_profiles.addresses.id",
      ],
      filters: { id: resources.merchantId },
    })

    return (
      (
        data[0] as unknown as {
          customer_profiles?: CustomerProfileGraph[]
        }
      )?.customer_profiles ?? []
    )
  }
  const profiles = await loadProfiles()
  const byEmail = new Map(
    profiles.flatMap((profile) => {
      const email = profile.customer?.email?.toLowerCase()
      return email ? [[email, profile] as const] : []
    }),
  )
  const customers: Array<{
    id: string
    email: string
    first_name: string
    last_name: string
    phone: string
    area: string
    street: string
  }> = []

  for (const fixture of customerFixtures) {
    const existing = byEmail.get(fixture.email)
    let customerId = existing?.customer_id
    let hasAddress = Boolean(existing?.addresses?.length)

    if (!customerId) {
      const { result } = await createMerchantCustomerWorkflow(container).run({
        input: {
          merchant_id: resources.merchantId as ResolvedMerchantId,
          sales_channel_id: resources.salesChannelId,
          actor_id: ownerId,
          customer: {
            email: fixture.email,
            first_name: fixture.first_name,
            last_name: fixture.last_name,
            phone: fixture.phone,
          },
          segment_ids: [],
        },
      })
      customerId = (result as unknown as { id: string }).id
      hasAddress = false
    }

    if (!hasAddress) {
      await createMerchantCustomerAddressWorkflow(container).run({
        input: {
          merchant_id: resources.merchantId as ResolvedMerchantId,
          customer_id: customerId,
          address: {
            address_name: "Home",
            is_default_shipping: true,
            is_default_billing: true,
            first_name: fixture.first_name,
            last_name: fixture.last_name,
            address_1: fixture.street,
            address_2: fixture.area,
            city: "Nairobi",
            country_code: "ke",
            phone: fixture.phone,
            metadata: {
              demo_version: demoVersion,
            },
          },
        },
      })
    }

    customers.push({ id: customerId, ...fixture })
  }

  logger.info(`Amani has ${customers.length} mock customers`)
  return customers
}

async function retrieveOrder(
  container: ExecArgs["container"],
  orderId: string,
) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "status",
      "total",
      "created_at",
      "metadata",
      "items.id",
      "items.quantity",
      "payment_collections.id",
      "payment_collections.payments.id",
      "payment_collections.payments.captured_at",
      "payment_collections.payments.canceled_at",
      "fulfillments.id",
      "fulfillments.delivered_at",
      "fulfillments.canceled_at",
    ],
    filters: { id: orderId },
  })
  const order = (data as unknown as OrderGraph[])[0]

  if (!order) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      `Amani demo order ${orderId} was not found`,
    )
  }

  return order
}

async function ensureOrderPayment(
  container: ExecArgs["container"],
  order: OrderGraph,
  capture: boolean,
  ownerId: string,
) {
  const paymentService = container.resolve(Modules.PAYMENT)
  let collection = order.payment_collections?.[0]

  if (!collection) {
    const {
      result: [created],
    } = await createOrderPaymentCollectionWorkflow(container).run({
      input: {
        order_id: order.id,
        amount: Number(order.total),
      },
    })
    collection = { id: created.id, payments: [] }
  }

  let payment = collection.payments?.find(({ canceled_at }) => !canceled_at)

  if (!payment) {
    const { result: session } = await createPaymentSessionsWorkflow(
      container,
    ).run({
      input: {
        payment_collection_id: collection.id,
        provider_id: "pp_system_default",
      },
    })
    const authorized = await paymentService.authorizePaymentSession(
      session.id,
      {},
    )

    if (!authorized) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `Could not authorize payment for Amani order ${order.id}`,
      )
    }

    payment = {
      id: authorized.id,
      captured_at: authorized.captured_at,
      canceled_at: authorized.canceled_at,
    }
  }

  if (capture && !payment.captured_at) {
    await capturePaymentWorkflow(container).run({
      input: {
        payment_id: payment.id,
        amount: Number(order.total),
        captured_by: ownerId,
      },
    })
  }
}

async function ensureOrderLifecycle(
  container: ExecArgs["container"],
  orderId: string,
  lifecycle: OrderLifecycle,
  resources: Awaited<ReturnType<typeof retrieveMerchantResources>>,
  deliveryMethod: { id: string; name: string; amount: number },
  ownerId: string,
) {
  let order = await retrieveOrder(container, orderId)

  if (lifecycle === "canceled") {
    if (order.status !== "canceled") {
      await ensureOrderPayment(container, order, false, ownerId)
      await cancelOrderWorkflow(container).run({
        input: {
          order_id: order.id,
          canceled_by: ownerId,
          no_notification: true,
        },
      })
    }

    return
  }

  const shouldCapture = lifecycle === "paid" || lifecycle === "delivered"
  await ensureOrderPayment(container, order, shouldCapture, ownerId)

  if (lifecycle !== "delivered") {
    return
  }

  order = await retrieveOrder(container, order.id)
  let fulfillment = order.fulfillments?.find(({ canceled_at }) => !canceled_at)

  if (!fulfillment) {
    const { result } = await createOrderFulfillmentWorkflow(container).run({
      input: {
        order_id: order.id,
        created_by: ownerId,
        location_id: resources.stockLocationId,
        shipping_option_id: deliveryMethod.id,
        no_notification: true,
        items: (order.items ?? []).map((item) => ({
          id: item.id,
          quantity: Number(item.quantity),
        })),
        metadata: {
          demo_version: demoVersion,
        },
      },
    })
    fulfillment = result
  }

  if (!fulfillment.delivered_at) {
    await markOrderFulfillmentAsDeliveredWorkflow(container).run({
      input: {
        orderId: order.id,
        fulfillmentId: fulfillment.id,
        no_notification: true,
      },
    })
  }
}

async function setDemoOrderDate(
  container: ExecArgs["container"],
  orderId: string,
  placedAt: Date,
) {
  const order = await retrieveOrder(container, orderId)
  const demoPlacedAt = placedAt.toISOString()

  if (order.metadata?.demo_placed_at === demoPlacedAt) {
    return
  }

  const orderService = container.resolve(Modules.ORDER)
  await orderService.updateOrders([
    {
      id: orderId,
      metadata: {
        ...(order.metadata ?? {}),
        demo_placed_at: demoPlacedAt,
      },
    },
  ])
}

async function ensureOrders(
  container: ExecArgs["container"],
  resources: Awaited<ReturnType<typeof retrieveMerchantResources>>,
  products: Map<string, ProductGraph>,
  customers: Awaited<ReturnType<typeof ensureCustomers>>,
  deliveryMethod: { id: string; name: string; amount: number },
  ownerId: string,
) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const link = container.resolve(ContainerRegistrationKeys.LINK)
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const { data: regionData } = await query.graph({
    entity: "region",
    fields: ["id", "currency_code"],
  })
  const region = (
    regionData as unknown as Array<{
      id: string
      currency_code: string
    }>
  ).find(({ currency_code }) => currency_code.toLowerCase() === "kes")

  if (!region) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "Run the base seed first so the Kenya region exists",
    )
  }

  const { data: merchantData } = await query.graph({
    entity: "merchant",
    fields: ["orders.id", "orders.metadata"],
    filters: { id: resources.merchantId },
  })
  const existingOrders =
    (merchantData[0] as unknown as { orders?: OrderGraph[] })?.orders ?? []
  const existingBySeedKey = new Map(
    existingOrders.flatMap((order) => {
      const key = order.metadata?.amani_demo_seed_key
      return typeof key === "string" ? [[key, order] as const] : []
    }),
  )

  for (let index = 0; index < orderCount; index += 1) {
    const seedKey = orderSeedKey(index)
    const placedAt = placedAtFor(index)
    const lifecycle = lifecycleFor(index)
    const customer = customers[index % customers.length]
    let orderId = existingBySeedKey.get(seedKey)?.id

    if (!orderId) {
      const itemCount = 1 + (index % 3)
      const selected = Array.from({ length: itemCount }, (_, itemIndex) => {
        return productFixtures[
          (index * 5 + itemIndex * 3) % productFixtures.length
        ]
      })
      const items = selected.map((fixture, itemIndex) => {
        const product = products.get(fixture.handle)!
        const quantity =
          fixture.price >= 500 ? 1 : 1 + ((index + itemIndex) % 2)

        return {
          title: fixture.title,
          thumbnail: imageUrl(fixture.image),
          quantity,
          unit_price: fixture.price,
          requires_shipping: true,
          is_discountable: true,
          product_id: product.id,
          product_title: fixture.title,
          product_description: fixture.description,
          product_handle: fixture.handle,
          variant_id: product.variants![0].id,
          variant_sku: fixture.sku,
          variant_title: fixture.pack,
          variant_option_values: { Pack: fixture.pack },
        }
      })
      const { result: created } = await createOrderWorkflow(container).run({
        input: {
          currency_code: "kes",
          region_id: region.id,
          customer_id: customer.id,
          email: customer.email,
          sales_channel_id: resources.salesChannelId,
          status: "pending",
          no_notification: true,
          shipping_address: {
            first_name: customer.first_name,
            last_name: customer.last_name,
            phone: customer.phone,
            address_1: customer.street,
            address_2: customer.area,
            city: "Nairobi",
            country_code: "ke",
          },
          billing_address: {
            first_name: customer.first_name,
            last_name: customer.last_name,
            phone: customer.phone,
            address_1: customer.street,
            address_2: customer.area,
            city: "Nairobi",
            country_code: "ke",
          },
          items,
          shipping_methods: [
            {
              name: deliveryMethod.name,
              amount: deliveryMethod.amount,
              shipping_option_id: deliveryMethod.id,
            },
          ],
          metadata: {
            demo_version: demoVersion,
            amani_demo_seed_key: seedKey,
            demo_placed_at: placedAt.toISOString(),
          },
        },
      })
      orderId = created.id

      await link.create({
        [MERCHANT_MODULE]: { merchant_id: resources.merchantId },
        [Modules.ORDER]: { order_id: orderId },
      })
    }

    await ensureOrderLifecycle(
      container,
      orderId,
      lifecycle,
      resources,
      deliveryMethod,
      ownerId,
    )
    await setDemoOrderDate(container, orderId, placedAt)

    if ((index + 1) % 6 === 0 || index === orderCount - 1) {
      logger.info(`Prepared ${index + 1}/${orderCount} Amani demo orders`)
    }
  }
}

export default async function seedAmaniDemo({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  logger.info("Seeding Amani Mini Mart hackathon demo...")

  const owner = await findOrCreateOwner(container)
  const resources = await ensureMerchant(container, owner.id)
  const categoryIds = await ensureCategories(
    container,
    resources.merchantId,
    resources.salesChannelId,
  )
  const products = await ensureProducts(
    container,
    resources.merchantId,
    resources.salesChannelId,
    categoryIds,
  )
  const deliveryMethod = await ensureDeliveryMethod(container, resources)
  const customers = await ensureCustomers(container, resources, owner.id)

  await ensureOrders(
    container,
    resources,
    products,
    customers,
    deliveryMethod,
    owner.id,
  )
  await ensureInventory(container, resources, products)

  logger.info("Amani Mini Mart is ready:")
  logger.info(`Storefront: ${storefrontUrl(`amani.${platformDomain}`)}`)
  logger.info(`Owner: ${amaniOwner.email}`)
  logger.info(`Password: ${ownerPassword}`)
  logger.info(
    `${productFixtures.length} products, ${customerFixtures.length} customers, ${orderCount} orders`,
  )
}
