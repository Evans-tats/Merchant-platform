import type { ExecArgs } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils"
import { createUsersWorkflow } from "@medusajs/medusa/core-flows"

import { MERCHANT_MODULE } from "../modules/merchant"
import MerchantModuleService from "../modules/merchant/service"
import { storefrontUrl } from "../services/storefront-url"
import { createMerchantProductsWorkflow } from "../workflows/merchant-catalog"
import { provisionMerchantWorkflow } from "../workflows/provision-merchant"

type DemoMerchant = {
  name: string
  slug: string
  hostname: string
  owner: {
    email: string
    first_name: string
    last_name: string
    password: string
  }
  product: {
    title: string
    handle: string
    sku: string
    description: string
    image: string
  }
}

// Shops live under MERCHANT_PLATFORM_DOMAIN like onboarded stores do, and a
// deployed demo sets DEMO_OWNER_PASSWORD so the repo default doesn't log in.
const platformDomain =
  process.env.MERCHANT_PLATFORM_DOMAIN?.trim() || "localhost"
const ownerPassword = process.env.DEMO_OWNER_PASSWORD || "supersecret"

const demoMerchants: DemoMerchant[] = [
  {
    name: "Merchant A",
    slug: "merchant-a",
    hostname: `shop-a.${platformDomain}`,
    owner: {
      email: "owner-a@test.local",
      first_name: "Merchant",
      last_name: "Owner A",
      password: ownerPassword,
    },
    product: {
      title: "Merchant A T-Shirt",
      handle: "merchant-a-t-shirt",
      sku: "MERCHANT-A-TSHIRT",
      description: "A sample product owned exclusively by Merchant A.",
      image:
        "https://medusa-public-images.s3.eu-west-1.amazonaws.com/tee-black-front.png",
    },
  },
  {
    name: "Merchant B",
    slug: "merchant-b",
    hostname: `shop-b.${platformDomain}`,
    owner: {
      email: "owner-b@test.local",
      first_name: "Merchant",
      last_name: "Owner B",
      password: ownerPassword,
    },
    product: {
      title: "Merchant B Sweatshirt",
      handle: "merchant-b-sweatshirt",
      sku: "MERCHANT-B-SWEATSHIRT",
      description: "A sample product owned exclusively by Merchant B.",
      image:
        "https://medusa-public-images.s3.eu-west-1.amazonaws.com/sweatshirt-vintage-front.png",
    },
  },
]

async function findOrCreateOwner(
  container: ExecArgs["container"],
  demo: DemoMerchant
) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const userService = container.resolve(Modules.USER)
  const authService = container.resolve(Modules.AUTH)
  const [existingOwner] = await userService.listUsers({
    email: demo.owner.email,
  })

  if (existingOwner) {
    logger.info(`Using existing demo owner ${demo.owner.email}`)
    return existingOwner
  }

  const {
    result: [owner],
  } = await createUsersWorkflow(container).run({
    input: {
      users: [
        {
          email: demo.owner.email,
          first_name: demo.owner.first_name,
          last_name: demo.owner.last_name,
        },
      ],
    },
  })
  const { authIdentity, error } = await authService.register("emailpass", {
    body: {
      email: demo.owner.email,
      password: demo.owner.password,
    },
  })

  if (error || !authIdentity) {
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      `Could not register ${demo.owner.email}: ${error ?? "unknown auth error"}`
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

async function seedMerchant(
  container: ExecArgs["container"],
  demo: DemoMerchant
) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const merchantService =
    container.resolve<MerchantModuleService>(MERCHANT_MODULE)
  const owner = await findOrCreateOwner(container, demo)
  const [existingMerchant] = await merchantService.listMerchants({
    slug: demo.slug,
  })

  let merchantId: string
  let salesChannelId: string

  if (existingMerchant) {
    const { data } = await query.graph({
      entity: "merchant",
      fields: ["id", "primary_sales_channel.id"],
      filters: { id: existingMerchant.id },
    })
    const merchant = data[0] as unknown as {
      id: string
      primary_sales_channel?: { id: string } | null
    }

    if (!merchant?.primary_sales_channel?.id) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `Existing merchant ${demo.slug} has no primary sales channel`
      )
    }

    merchantId = merchant.id
    salesChannelId = merchant.primary_sales_channel.id
    logger.info(`Using existing demo merchant ${demo.name}`)
  } else {
    const { result } = await provisionMerchantWorkflow(container).run({
      input: {
        name: demo.name,
        slug: demo.slug,
        platform_hostname: demo.hostname,
        owner_actor_id: owner.id,
        theme_configuration: {
          branding: {
            name: demo.name,
            primary_color: demo.slug === "merchant-a" ? "#2563eb" : "#7c3aed",
          },
          pages: {},
        },
      },
    })

    merchantId = result.merchant.id
    salesChannelId = result.salesChannel.id
    logger.info(`Provisioned demo merchant ${demo.name}`)
  }

  const { data: merchantProducts } = await query.graph({
    entity: "merchant",
    fields: ["products.id", "products.handle"],
    filters: { id: merchantId },
  })
  const existingHandles = new Set(
    ((merchantProducts[0] as unknown as {
      products?: Array<{ handle: string }>
    })?.products ?? []).map(({ handle }) => handle)
  )

  if (!existingHandles.has(demo.product.handle)) {
    await createMerchantProductsWorkflow(container).run({
      input: {
        merchant_id: merchantId,
        sales_channel_id: salesChannelId,
        products: [
          {
            title: demo.product.title,
            handle: demo.product.handle,
            description: demo.product.description,
            status: "published",
            images: [{ url: demo.product.image }],
            options: [
              {
                title: "Size",
                values: ["Standard"],
              },
            ],
            variants: [
              {
                title: "Standard",
                sku: demo.product.sku,
                manage_inventory: false,
                options: { Size: "Standard" },
                prices: [
                  {
                    amount: demo.slug === "merchant-a" ? 2500 : 3500,
                    currency_code: "kes",
                  },
                ],
              },
            ],
          },
        ],
      },
    })
    logger.info(`Created sample product for ${demo.name}`)
  } else {
    logger.info(`Sample product for ${demo.name} already exists`)
  }

  return {
    merchantId,
    salesChannelId,
  }
}

export default async function seedDemoMerchants({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  logger.info("Seeding persistent demo merchants...")

  for (const demo of demoMerchants) {
    await seedMerchant(container, demo)
  }

  logger.info("Demo merchants are ready:")
  for (const demo of demoMerchants) {
    logger.info(
      `${demo.name}: ${storefrontUrl(demo.hostname)} | ${demo.owner.email} / ${
        process.env.DEMO_OWNER_PASSWORD ? "DEMO_OWNER_PASSWORD" : ownerPassword
      }`
    )
  }
}
