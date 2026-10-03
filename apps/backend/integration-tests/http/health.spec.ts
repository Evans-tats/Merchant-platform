import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  ContainerRegistrationKeys,
  generateJwtToken,
  Modules,
} from "@medusajs/framework/utils"
import MerchantModuleService from "../../src/modules/merchant/service"
import { MERCHANT_MODULE } from "../../src/modules/merchant"
import {
  assertMerchantOwns,
  resolveStaffMerchant,
  resolveStoreMerchant,
} from "../../src/services/tenant-resolution"
import { provisionMerchantWorkflow } from "../../src/workflows/provision-merchant"
import { createMerchantProductsWorkflow } from "../../src/workflows/merchant-catalog"
import { createMerchantDeliveryMethodWorkflow } from "../../src/workflows/merchant-delivery"
import {
  createMerchantCustomerAddressWorkflow,
  retrieveMerchantCustomerWorkflow,
} from "../../src/workflows/merchant-customer"
import {
  createMerchantAFixture,
  createMerchantBFixture,
} from "../helpers/merchant-fixtures"

jest.setTimeout(180000)

const createProductImageForm = (type = "image/png") => {
  const form = new FormData()
  form.append(
    "files",
    new Blob(["merchant product image"], { type }),
    type === "image/png" ? "product.png" : "product.txt"
  )

  return form
}

medusaIntegrationTestRunner({
  moduleName: "merchant-platform-http",
  cwd: process.cwd(),
  testSuite: ({ api, dbConfig, getContainer }) => {
    describe("platform integration", () => {
      it("boots Medusa against a disposable database", async () => {
        expect(dbConfig.dbName).toMatch(
          /^medusa-merchant-platform-http-integration-/
        )

        const response = await api.get("/health")

        expect(response.status).toBe(200)
        expect(response.data).toBe("OK")
      })

      it("enforces merchant ownership cardinality across Medusa modules", async () => {
        const container = getContainer()
        const link = container.resolve(ContainerRegistrationKeys.LINK)
        const query = container.resolve(ContainerRegistrationKeys.QUERY)
        const merchantService =
          container.resolve<MerchantModuleService>(MERCHANT_MODULE)
        const productService = container.resolve(Modules.PRODUCT)
        const salesChannelService = container.resolve(Modules.SALES_CHANNEL)
        const stockLocationService = container.resolve(Modules.STOCK_LOCATION)
        const orderService = container.resolve(Modules.ORDER)
        const fixtureA = createMerchantAFixture()
        const fixtureB = createMerchantBFixture()
        const merchantA = await merchantService.createMerchants(
          fixtureA.merchant
        )
        const merchantB = await merchantService.createMerchants(
          fixtureB.merchant
        )
        const salesChannelA =
          await salesChannelService.createSalesChannels({
            name: "Merchant A primary sales channel",
          })
        const salesChannelB =
          await salesChannelService.createSalesChannels({
            name: "Merchant B primary sales channel",
          })
        const productA = await productService.createProducts({
          title: "Merchant A product one",
        })
        const productB = await productService.createProducts({
          title: "Merchant A product two",
        })
        const stockLocationA =
          await stockLocationService.createStockLocations({
            name: "Merchant A location one",
          })
        const stockLocationB =
          await stockLocationService.createStockLocations({
            name: "Merchant A location two",
          })
        const orderA = await orderService.createOrders({
          currency_code: "kes",
          sales_channel_id: salesChannelA.id,
        })
        const orderB = await orderService.createOrders({
          currency_code: "kes",
          sales_channel_id: salesChannelA.id,
        })

        await link.create({
          [MERCHANT_MODULE]: { merchant_id: merchantA.id },
          [Modules.SALES_CHANNEL]: {
            sales_channel_id: salesChannelA.id,
          },
        })
        await link.create([
          {
            [MERCHANT_MODULE]: { merchant_id: merchantA.id },
            [Modules.PRODUCT]: { product_id: productA.id },
          },
          {
            [MERCHANT_MODULE]: { merchant_id: merchantA.id },
            [Modules.PRODUCT]: { product_id: productB.id },
          },
          {
            [MERCHANT_MODULE]: { merchant_id: merchantA.id },
            [Modules.STOCK_LOCATION]: {
              stock_location_id: stockLocationA.id,
            },
          },
          {
            [MERCHANT_MODULE]: { merchant_id: merchantA.id },
            [Modules.STOCK_LOCATION]: {
              stock_location_id: stockLocationB.id,
            },
          },
          {
            [MERCHANT_MODULE]: { merchant_id: merchantA.id },
            [Modules.ORDER]: { order_id: orderA.id },
          },
          {
            [MERCHANT_MODULE]: { merchant_id: merchantA.id },
            [Modules.ORDER]: { order_id: orderB.id },
          },
        ])

        const { data: merchants } = await query.graph({
          entity: "merchant",
          fields: [
            "id",
            "primary_sales_channel.id",
            "products.id",
            "stock_locations.id",
            "orders.id",
          ],
          filters: { id: merchantA.id },
        })
        const merchantGraph = merchants[0] as unknown as {
          primary_sales_channel: { id: string }
          products: Array<{ id: string }>
          stock_locations: Array<{ id: string }>
          orders: Array<{ id: string }>
        }

        expect(merchantGraph.primary_sales_channel.id).toBe(
          salesChannelA.id
        )
        expect(merchantGraph.products.map(({ id }) => id).sort()).toEqual(
          [productA.id, productB.id].sort()
        )
        expect(
          merchantGraph.stock_locations.map(({ id }) => id).sort()
        ).toEqual([stockLocationA.id, stockLocationB.id].sort())
        expect(merchantGraph.orders.map(({ id }) => id).sort()).toEqual(
          [orderA.id, orderB.id].sort()
        )

        await expect(
          link.create({
            [MERCHANT_MODULE]: { merchant_id: merchantB.id },
            [Modules.PRODUCT]: { product_id: productA.id },
          })
        ).rejects.toThrow()
        await expect(
          link.create({
            [MERCHANT_MODULE]: { merchant_id: merchantA.id },
            [Modules.SALES_CHANNEL]: {
              sales_channel_id: salesChannelB.id,
            },
          })
        ).rejects.toThrow()
        await expect(
          link.create({
            [MERCHANT_MODULE]: { merchant_id: merchantB.id },
            [Modules.SALES_CHANNEL]: {
              sales_channel_id: salesChannelA.id,
            },
          })
        ).rejects.toThrow()
        await expect(
          link.create({
            [MERCHANT_MODULE]: { merchant_id: merchantB.id },
            [Modules.STOCK_LOCATION]: {
              stock_location_id: stockLocationA.id,
            },
          })
        ).rejects.toThrow()
        await expect(
          link.create({
            [MERCHANT_MODULE]: { merchant_id: merchantB.id },
            [Modules.ORDER]: { order_id: orderA.id },
          })
        ).rejects.toThrow()
      })

      it("resolves customer profiles and members from stored actor IDs", async () => {
        const container = getContainer()
        const query = container.resolve(ContainerRegistrationKeys.QUERY)
        const merchantService =
          container.resolve<MerchantModuleService>(MERCHANT_MODULE)
        const customerService = container.resolve(Modules.CUSTOMER)
        const userService = container.resolve(Modules.USER)
        const fixtureA = createMerchantAFixture()
        const fixtureB = createMerchantBFixture()
        const merchantA = await merchantService.createMerchants(
          fixtureA.merchant
        )
        const merchantB = await merchantService.createMerchants(
          fixtureB.merchant
        )
        const customer = await customerService.createCustomers({
          email: fixtureA.shopper.email,
          has_account: true,
        })
        const user = await userService.createUsers({
          email: fixtureA.owner.email,
        })
        const profileA =
          await merchantService.createMerchantCustomerProfiles({
            merchant_id: merchantA.id,
            customer_id: customer.id,
          })
        const profileB =
          await merchantService.createMerchantCustomerProfiles({
            merchant_id: merchantB.id,
            customer_id: customer.id,
          })
        const member = await merchantService.createMerchantMembers({
          merchant_id: merchantA.id,
          actor_id: user.id,
          role: "owner",
          status: "active",
        })

        const { data: profiles } = await query.graph({
          entity: "merchant_customer_profile",
          fields: ["id", "merchant_id", "customer.id", "customer.email"],
          filters: { id: [profileA.id, profileB.id] },
        })
        const { data: members } = await query.graph({
          entity: "merchant_member",
          fields: ["id", "actor_id", "user.id", "user.email"],
          filters: { id: member.id },
        })
        const { data: customers } = await query.graph({
          entity: "customer",
          fields: [
            "id",
            "merchant_customer_profiles.id",
            "merchant_customer_profiles.merchant_id",
          ],
          filters: { id: customer.id },
        })
        const { data: users } = await query.graph({
          entity: "user",
          fields: ["id", "merchant_members.id", "merchant_members.merchant_id"],
          filters: { id: user.id },
        })
        const customerWithProfiles = customers[0] as unknown as {
          id: string
          merchant_customer_profiles: Array<{
            id: string
            merchant_id: string
          }>
        }
        const userWithMembers = users[0] as unknown as {
          id: string
          merchant_members: Array<{
            id: string
            merchant_id: string
          }>
        }

        expect(profiles).toHaveLength(2)
        const profileGraphs = profiles as unknown as Array<{
          customer: { id: string }
        }>
        const memberGraph = members[0] as unknown as {
          actor_id: string
          user: { id: string }
        }

        expect(profileGraphs.every(({ customer: linkedCustomer }) => {
          return linkedCustomer.id === customer.id
        })).toBe(true)
        expect(memberGraph.user.id).toBe(user.id)
        expect(memberGraph.actor_id).toBe(user.id)
        expect(
          customerWithProfiles.merchant_customer_profiles
            .map(({ id }) => id)
            .sort()
        ).toEqual([profileA.id, profileB.id].sort())
        expect(userWithMembers.merchant_members[0].id).toBe(member.id)
      })

      it("provisions complete, isolated merchant storefronts", async () => {
        const container = getContainer()
        const link = container.resolve(ContainerRegistrationKeys.LINK)
        const cartService = container.resolve(Modules.CART)
        const customerService = container.resolve(Modules.CUSTOMER)
        const orderService = container.resolve(Modules.ORDER)
        const regionService = container.resolve(Modules.REGION)
        const userService = container.resolve(Modules.USER)
        const merchantService =
          container.resolve<MerchantModuleService>(MERCHANT_MODULE)
        const fixtureA = createMerchantAFixture()
        const fixtureB = createMerchantBFixture()
        await regionService.createRegions({
          name: "Catalog test region",
          currency_code: "eur",
          automatic_taxes: false,
          countries: ["de"],
        })
        const ownerA = await userService.createUsers({
          email: fixtureA.owner.email,
          first_name: fixtureA.owner.firstName,
          last_name: fixtureA.owner.lastName,
        })
        const ownerB = await userService.createUsers({
          email: fixtureB.owner.email,
          first_name: fixtureB.owner.firstName,
          last_name: fixtureB.owner.lastName,
        })

        const { result: merchantA } = await provisionMerchantWorkflow(
          container
        ).run({
          input: {
            name: fixtureA.merchant.name,
            slug: fixtureA.merchant.slug,
            platform_hostname: fixtureA.domain.hostname.toUpperCase(),
            owner_actor_id: ownerA.id,
          },
        })
        const { result: merchantB } = await provisionMerchantWorkflow(
          container
        ).run({
          input: {
            name: fixtureB.merchant.name,
            slug: fixtureB.merchant.slug,
            platform_hostname: fixtureB.domain.hostname,
            owner_actor_id: ownerB.id,
            payment_provider: "mpesa_paybill",
          },
        })

        expect(merchantA.merchant.status).toBe("active")
        expect(merchantA.domain).toMatchObject({
          hostname: fixtureA.domain.hostname,
          type: "platform",
          status: "active",
          is_primary: true,
        })
        expect(merchantA.publishableApiKey.type).toBe("publishable")
        expect(merchantA.shippingProfile).toMatchObject({
          type: "default",
        })
        expect(merchantA.theme).toMatchObject({
          version: 1,
          is_active: true,
        })
        expect(merchantA.ownerMembership).toMatchObject({
          actor_id: ownerA.id,
          role: "owner",
          status: "active",
        })
        expect(merchantA.paymentConfig).toMatchObject({
          provider: "mpesa_stk",
          mode: "sandbox",
          status: "disabled",
          secret_reference: null,
        })

        const publicConfigurationA = await api.get(
          "/storefront/configuration",
          {
            params: { hostname: fixtureA.domain.hostname },
          }
        )
        const publicConfigurationB = await api.get(
          "/storefront/configuration",
          {
            params: { hostname: fixtureB.domain.hostname },
          }
        )

        expect(publicConfigurationA.status).toBe(200)
        expect(publicConfigurationA.data.configuration).toMatchObject({
          merchant: {
            id: merchantA.merchant.id,
            name: merchantA.merchant.name,
            slug: merchantA.merchant.slug,
          },
          sales_channel: { id: merchantA.salesChannel.id },
          publishable_api_key: merchantA.publishableApiKey.token,
        })
        expect(publicConfigurationB.data.configuration.merchant.id).toBe(
          merchantB.merchant.id
        )
        expect(
          JSON.stringify(publicConfigurationA.data)
        ).not.toContain("secret_reference")

        const merchantRouteHeadersA = {
          Host: fixtureA.domain.hostname,
          "x-publishable-api-key": merchantA.publishableApiKey.token,
        }
        const [themeResponse, pagesResponse] = await Promise.all([
          api.get("/store/merchant/theme", {
            headers: merchantRouteHeadersA,
          }),
          api.get("/store/merchant/pages", {
            headers: merchantRouteHeadersA,
          }),
        ])

        expect(themeResponse.status).toBe(200)
        expect(themeResponse.data.theme).toMatchObject({
          id: merchantA.theme.id,
          is_active: true,
        })
        expect(pagesResponse.status).toBe(200)
        expect(pagesResponse.data.pages).toEqual([])

        const storefrontA = await resolveStoreMerchant(
          container,
          `${fixtureA.domain.hostname.toUpperCase()}:443`,
          merchantA.publishableApiKey.token
        )
        const storefrontB = await resolveStoreMerchant(
          container,
          fixtureB.domain.hostname,
          merchantB.publishableApiKey.token
        )
        const staffA = await resolveStaffMerchant(
          container,
          ownerA.id,
          merchantA.merchant.id,
          { allowed_roles: ["owner"] }
        )

        expect(storefrontA.merchant.id).toBe(merchantA.merchant.id)
        expect(storefrontA.salesChannel.id).toBe(
          merchantA.salesChannel.id
        )
        expect(staffA.merchant.id).toBe(merchantA.merchant.id)
        expect(staffA.member.role).toBe("owner")

        const ownerAToken = await generateJwtToken(
          {
            actor_id: ownerA.id,
            actor_type: "user",
            auth_identity_id: "test-auth-identity-a",
            app_metadata: {},
            user_metadata: {},
          },
          {
            secret: process.env.JWT_SECRET!,
            expiresIn: "1h",
          }
        )
        const staffHeadersA = {
          Authorization: `Bearer ${ownerAToken}`,
        }
        const merchantImageUpload = await api.post(
          `/admin/merchants/${merchantA.merchant.id}/uploads`,
          createProductImageForm(),
          { headers: staffHeadersA }
        )

        expect(merchantImageUpload.status).toBe(200)
        expect(merchantImageUpload.data.files[0]).toMatchObject({
          id: expect.any(String),
          url: expect.any(String),
        })
        await expect(
          api.post(
            `/admin/merchants/${merchantB.merchant.id}/uploads`,
            createProductImageForm(),
            { headers: staffHeadersA }
          )
        ).rejects.toMatchObject({ response: { status: 404 } })
        await expect(
          api.post(
            `/admin/merchants/${merchantA.merchant.id}/uploads`,
            createProductImageForm("text/plain"),
            { headers: staffHeadersA }
          )
        ).rejects.toMatchObject({ response: { status: 400 } })
        const deliveryMethodInput = {
          name: "Standard delivery",
          description: "Door-to-door delivery",
          estimated_delivery: "2-3 business days",
          country_codes: ["ke"],
          price: { amount: 300, currency_code: "kes" },
          is_enabled: true,
          is_default: true,
        }
        const deliveryAResponse = await api.post(
          `/admin/merchants/${merchantA.merchant.id}/delivery-options`,
          {
            ...deliveryMethodInput,
            stock_location_id: merchantA.stockLocation.id,
            shipping_profile_id: merchantA.shippingProfile.id,
          },
          { headers: staffHeadersA }
        )

        expect(deliveryAResponse.status).toBe(201)

        const updatedDeliveryAResponse = await api.post(
          `/admin/merchants/${merchantA.merchant.id}/delivery-options/${deliveryAResponse.data.delivery_option.id}`,
          {
            ...deliveryMethodInput,
            name: "Updated standard delivery",
            country_codes: ["ke", "ug"],
            price: { amount: 350, currency_code: "kes" },
            is_enabled: false,
            is_default: false,
            stock_location_id: merchantA.stockLocation.id,
            shipping_profile_id: merchantA.shippingProfile.id,
          },
          { headers: staffHeadersA }
        )

        expect(updatedDeliveryAResponse.status).toBe(200)

        const expressDeliveryAResponse = await api.post(
          `/admin/merchants/${merchantA.merchant.id}/delivery-options`,
          {
            ...deliveryMethodInput,
            name: "Express delivery",
            estimated_delivery: "Same day",
            price: { amount: 700, currency_code: "kes" },
            stock_location_id: merchantA.stockLocation.id,
            shipping_profile_id: merchantA.shippingProfile.id,
          },
          { headers: staffHeadersA }
        )

        expect(expressDeliveryAResponse.status).toBe(201)

        const { result: deliveryBResult } =
          await createMerchantDeliveryMethodWorkflow(container).run({
            input: {
              merchant_id: merchantB.merchant.id,
              sales_channel_id: merchantB.salesChannel.id,
              stock_location_id: merchantB.stockLocation.id,
              shipping_profile_id: merchantB.shippingProfile.id,
              ...deliveryMethodInput,
            },
          })
        const deliveryAList = await api.get(
          `/admin/merchants/${merchantA.merchant.id}/delivery-options`,
          { headers: staffHeadersA }
        )

        expect(deliveryAList.data.delivery_options).toHaveLength(2)
        expect(deliveryAList.data.delivery_options[0]).toMatchObject({
          id: expressDeliveryAResponse.data.delivery_option.id,
          name: "Express delivery",
          is_enabled: true,
          is_default: true,
          stock_location: { id: merchantA.stockLocation.id },
          shipping_profile: { id: merchantA.shippingProfile.id },
          service_zone: { country_codes: ["ke"] },
          price: { amount: 700, currency_code: "kes" },
        })
        expect(deliveryAList.data.delivery_options[1]).toMatchObject({
          id: deliveryAResponse.data.delivery_option.id,
          name: "Updated standard delivery",
          is_enabled: false,
          is_default: false,
          service_zone: { country_codes: ["ke", "ug"] },
          price: { amount: 350, currency_code: "kes" },
        })
        expect(
          deliveryAList.data.delivery_options.map(
            ({ id }: { id: string }) => id
          )
        ).not.toContain(deliveryBResult[0].id)

        await expect(
          api.post(
            `/admin/merchants/${merchantA.merchant.id}/delivery-options/${deliveryBResult[0].id}`,
            {
              ...deliveryMethodInput,
              name: "Cross-tenant update",
              stock_location_id: merchantA.stockLocation.id,
              shipping_profile_id: merchantA.shippingProfile.id,
            },
            { headers: staffHeadersA }
          )
        ).rejects.toMatchObject({ response: { status: 404 } })
        const merchantManagementA = await api.get(
          `/admin/merchants/${merchantA.merchant.id}`,
          { headers: staffHeadersA }
        )

        expect(merchantManagementA.status).toBe(200)
        expect(merchantManagementA.data.merchant.id).toBe(
          merchantA.merchant.id
        )

        const merchantSessionA = await api.get(
          "/admin/merchant-session",
          { headers: staffHeadersA }
        )

        expect(merchantSessionA.status).toBe(200)
        expect(merchantSessionA.data).toMatchObject({
          merchant: {
            id: merchantA.merchant.id,
            name: fixtureA.merchant.name,
          },
          member: {
            actor_id: ownerA.id,
            role: "owner",
            status: "active",
          },
        })

        const additionalMembership =
          await merchantService.createMerchantMembers({
            merchant_id: merchantB.merchant.id,
            actor_id: ownerA.id,
            role: "admin",
            status: "active",
          })
        const selectedMerchantSession = await api.get(
          `/admin/merchant-session?merchant_id=${merchantB.merchant.id}`,
          { headers: staffHeadersA }
        )

        expect(selectedMerchantSession.status).toBe(200)
        expect(selectedMerchantSession.data).toMatchObject({
          merchant: {
            id: merchantB.merchant.id,
            name: fixtureB.merchant.name,
          },
          member: {
            actor_id: ownerA.id,
            role: "admin",
            status: "active",
          },
        })
        expect(selectedMerchantSession.data.memberships).toHaveLength(2)

        await expect(
          api.get("/admin/merchant-session?merchant_id=merch_not_owned", {
            headers: staffHeadersA,
          })
        ).rejects.toMatchObject({ response: { status: 404 } })
        await merchantService.deleteMerchantMembers(additionalMembership.id)

        const invitationResponse = await api.post(
          "/admin/merchants/" +
            merchantA.merchant.id +
            "/members",
          {
            email: "new-staff-a@example.test",
            role: "staff",
          },
          { headers: staffHeadersA }
        )

        expect(invitationResponse.status).toBe(201)
        expect(invitationResponse.data.invitation).toMatchObject({
          email: "new-staff-a@example.test",
          role: "staff",
          status: "pending",
        })

        const query = container.resolve(ContainerRegistrationKeys.QUERY)
        const { data: invitationData } = await query.graph({
          entity: "invite",
          fields: ["id", "rbac_roles.id"],
          filters: {
            id: invitationResponse.data.invitation.invite_id,
          },
        })
        const coreInvitation = invitationData[0] as unknown as {
          rbac_roles?: Array<{ id: string }>
        }

        expect(coreInvitation.rbac_roles ?? []).toHaveLength(0)

        await expect(
          api.get("/admin/products", { headers: staffHeadersA })
        ).rejects.toMatchObject({ response: { status: 403 } })

        const topbarLayout = await api.get(
          "/admin/layouts/topbar/configuration",
          { headers: staffHeadersA }
        )

        expect(topbarLayout.status).toBe(200)

        await expect(
          api.post(
            "/admin/layouts/topbar/configuration",
            { is_default: true, configuration: { widgets: {} } },
            { headers: staffHeadersA }
          )
        ).rejects.toMatchObject({ response: { status: 403 } })

        await expect(
          api.get(`/admin/merchants/${merchantB.merchant.id}`, {
            headers: staffHeadersA,
          })
        ).rejects.toMatchObject({ response: { status: 404 } })

        const invalidProductResult = await createMerchantProductsWorkflow(
          container
        ).run({
          throwOnError: false,
          input: {
            merchant_id: merchantA.merchant.id,
            sales_channel_id: merchantA.salesChannel.id,
            products: [{
              title: "Unpriced published product",
              handle: "unpriced-published-product",
              status: "published",
              options: [{ title: "Default", values: ["Default"] }],
              variants: [{
                title: "Default",
                manage_inventory: false,
                options: { Default: "Default" },
              }],
            }],
          },
        })
        expect(
          invalidProductResult.errors.map(({ error }) => error.message)
        ).toContainEqual(expect.stringMatching(/needs EUR pricing/))
        const { data: invalidProducts } = await query.graph({
          entity: "product",
          fields: ["id"],
          filters: { handle: "unpriced-published-product" },
        })
        expect(invalidProducts).toHaveLength(0)
        await expect(
          api.post(
            `/admin/merchants/${merchantA.merchant.id}/products`,
            {
              products: [{
                title: "Unpriced product through API",
                handle: "unpriced-product-through-api",
                status: "published",
                options: [{ title: "Default", values: ["Default"] }],
                variants: [{
                  title: "Default",
                  manage_inventory: false,
                  options: { Default: "Default" },
                }],
              }],
            },
            { headers: staffHeadersA }
          )
        ).rejects.toMatchObject({
          response: {
            status: 400,
            data: {
              message: expect.stringMatching(/needs EUR pricing/),
            },
          },
        })

        const { result: productsA } = await createMerchantProductsWorkflow(
          container
        ).run({
          input: {
            merchant_id: merchantA.merchant.id,
            sales_channel_id: merchantA.salesChannel.id,
            products: [
              {
                title: fixtureA.product.title,
                handle: fixtureA.product.handle,
                status: "published",
                options: [
                  {
                    title: "Default",
                    values: ["Default"],
                  },
                ],
                variants: [
                  {
                    title: "Merchant A default variant",
                    sku: fixtureA.product.sku,
                    manage_inventory: false,
                    options: { Default: "Default" },
                    prices: [{ amount: 25, currency_code: "eur" }],
                  },
                ],
              },
            ],
          },
        })
        const { result: productsB } = await createMerchantProductsWorkflow(
          container
        ).run({
          input: {
            merchant_id: merchantB.merchant.id,
            sales_channel_id: merchantB.salesChannel.id,
            products: [
              {
                title: fixtureB.product.title,
                handle: fixtureB.product.handle,
                status: "published",
                options: [
                  {
                    title: "Default",
                    values: ["Default"],
                  },
                ],
                variants: [
                  {
                    title: "Merchant B default variant",
                    sku: fixtureB.product.sku,
                    manage_inventory: false,
                    options: { Default: "Default" },
                    prices: [{ amount: 35, currency_code: "eur" }],
                  },
                ],
              },
            ],
          },
        })
        const merchantProductList = await api.get(
          `/admin/merchants/${merchantA.merchant.id}/products`,
          {
            params: {
              q: fixtureA.product.title,
              status: "published",
              limit: 1,
              offset: 0,
              order: "-created_at",
            },
            headers: staffHeadersA,
          }
        )

        expect(merchantProductList.status).toBe(200)
        expect(merchantProductList.data).toMatchObject({
          count: 1,
          limit: 1,
          offset: 0,
        })
        expect(merchantProductList.data.products.map(({ id }) => id)).toEqual([
          productsA[0].id,
        ])

        const merchantProductUpdate = await api.post(
          `/admin/merchants/${merchantA.merchant.id}/products/${productsA[0].id}`,
          { update: { subtitle: "Merchant-managed product" } },
          { headers: staffHeadersA }
        )

        expect(merchantProductUpdate.status).toBe(200)
        expect(merchantProductUpdate.data.product.subtitle).toBe(
          "Merchant-managed product"
        )

        await expect(
          api.post(
            `/admin/merchants/${merchantA.merchant.id}/products/${productsB[0].id}`,
            { update: { title: "Cross-merchant update" } },
            { headers: staffHeadersA }
          )
        ).rejects.toMatchObject({ response: { status: 404 } })

        const storeHeadersA = {
          Host: fixtureA.domain.hostname,
          "x-publishable-api-key": merchantA.publishableApiKey.token,
        }
        const catalogA = await api.get("/store/products", {
          headers: storeHeadersA,
        })
        const storefrontAResponse = await api.get("/store/merchant", {
          headers: storeHeadersA,
        })

        expect(catalogA.status).toBe(200)
        expect(catalogA.data.products.map(({ id }) => id)).toEqual([
          productsA[0].id,
        ])
        expect(catalogA.data.products.map(({ id }) => id)).not.toContain(
          productsB[0].id
        )
        expect(storefrontAResponse.data.merchant.id).toBe(
          merchantA.merchant.id
        )

        const guestOrderA = await orderService.createOrders({
          currency_code: "kes",
          email: "guest-a@example.test",
          sales_channel_id: merchantA.salesChannel.id,
        })

        await link.create({
          [MERCHANT_MODULE]: { merchant_id: merchantA.merchant.id },
          [Modules.ORDER]: { order_id: guestOrderA.id },
        })

        const guestOrderConfirmation = await api.get(
          `/store/orders/${guestOrderA.id}`,
          { headers: storeHeadersA }
        )

        expect(guestOrderConfirmation.status).toBe(200)
        expect(guestOrderConfirmation.data.order.id).toBe(guestOrderA.id)
        await expect(
          api.get(`/store/orders/${guestOrderA.id}`, {
            headers: {
              Host: fixtureB.domain.hostname,
              "x-publishable-api-key": merchantB.publishableApiKey.token,
            },
          })
        ).rejects.toMatchObject({ response: { status: 404 } })

        const shopper = await customerService.createCustomers({
          email: fixtureA.shopper.email,
          has_account: true,
        })
        const shopperToken = await generateJwtToken(
          {
            actor_id: shopper.id,
            actor_type: "customer",
            auth_identity_id: "test-shopper-auth-identity",
            app_metadata: {},
            user_metadata: {},
          },
          {
            secret: process.env.JWT_SECRET!,
            expiresIn: "1h",
          }
        )
        const shopperHeadersA = {
          ...storeHeadersA,
          Authorization: "Bearer " + shopperToken,
        }
        const shopperHeadersB = {
          Host: fixtureB.domain.hostname,
          "x-publishable-api-key":
            merchantB.publishableApiKey.token,
          Authorization: "Bearer " + shopperToken,
        }

        await retrieveMerchantCustomerWorkflow(container).run({
          input: {
            merchant_id: storefrontA.merchant.id,
            customer_id: shopper.id,
          },
        })
        await retrieveMerchantCustomerWorkflow(container).run({
          input: {
            merchant_id: storefrontB.merchant.id,
            customer_id: shopper.id,
          },
        })
        await createMerchantCustomerAddressWorkflow(container).run({
          input: {
            merchant_id: storefrontA.merchant.id,
            customer_id: shopper.id,
            address: {
              address_name: "Merchant A home",
              address_1: "A Street",
              city: "Nairobi",
              country_code: "ke",
            },
          },
        })
        await createMerchantCustomerAddressWorkflow(container).run({
          input: {
            merchant_id: storefrontB.merchant.id,
            customer_id: shopper.id,
            address: {
              address_name: "Merchant B home",
              address_1: "B Street",
              city: "Mombasa",
              country_code: "ke",
            },
          },
        })

        const shopperProfileA = await api.get(
          "/store/customers/me",
          { headers: shopperHeadersA }
        )
        const shopperProfileB = await api.get(
          "/store/customers/me",
          { headers: shopperHeadersB }
        )

        expect(
          shopperProfileA.data.customer.addresses.map(
            ({ address_name }: { address_name: string }) =>
              address_name
          )
        ).toEqual(["Merchant A home"])
        expect(
          shopperProfileB.data.customer.addresses.map(
            ({ address_name }: { address_name: string }) =>
              address_name
          )
        ).toEqual(["Merchant B home"])

        await expect(
          api.get(`/store/products/${productsB[0].id}`, {
            headers: storeHeadersA,
          })
        ).rejects.toMatchObject({ response: { status: 404 } })

        const cartA = await cartService.createCarts({
          currency_code: "kes",
          sales_channel_id: merchantA.salesChannel.id,
        })

        await link.create({
          [MERCHANT_MODULE]: { merchant_id: merchantA.merchant.id },
          [Modules.CART]: { cart_id: cartA.id },
        })

        const cartB = await cartService.createCarts({
          currency_code: "kes",
          sales_channel_id: merchantB.salesChannel.id,
        })

        await link.create({
          [MERCHANT_MODULE]: { merchant_id: merchantB.merchant.id },
          [Modules.CART]: { cart_id: cartB.id },
        })

        await expect(
          api.get("/store/shipping-options", {
            params: { cart_id: cartB.id },
            headers: storeHeadersA,
          })
        ).rejects.toMatchObject({ response: { status: 404 } })

        const cartAResponse = await api.get(
          `/store/carts/${cartA.id}`,
          { headers: storeHeadersA }
        )

        expect(cartAResponse.status).toBe(200)
        expect(cartAResponse.data.cart.id).toBe(cartA.id)

        await expect(
          api.post(
            `/store/carts/${cartA.id}/line-items`,
            {
              variant_id: productsB[0].variants[0].id,
              quantity: 1,
            },
            { headers: storeHeadersA }
          )
        ).rejects.toMatchObject({ response: { status: 404 } })

        await assertMerchantOwns(
          container,
          "sales_channel",
          merchantA.salesChannel.id,
          staffA.merchant.id
        )
        await assertMerchantOwns(
          container,
          "stock_location",
          merchantA.stockLocation.id,
          storefrontA.merchant.id
        )

        await expect(
          resolveStoreMerchant(
            container,
            fixtureA.domain.hostname,
            merchantB.publishableApiKey.token
          )
        ).rejects.toThrow("Storefront not found")
        await expect(
          resolveStaffMerchant(
            container,
            ownerA.id,
            merchantB.merchant.id
          )
        ).rejects.toThrow("Merchant membership not found")
        await expect(
          resolveStaffMerchant(
            container,
            ownerA.id,
            merchantA.merchant.id,
            { allowed_roles: ["admin"] }
          )
        ).rejects.toThrow(
          "Merchant member does not have permission for this operation"
        )
        await expect(
          assertMerchantOwns(
            container,
            "sales_channel",
            merchantB.salesChannel.id,
            staffA.merchant.id
          )
        ).rejects.toThrow("sales_channel not found")

        const staffUser = await userService.createUsers({
          email: "limited-staff-a@example.test",
        })
        const staffMember = await merchantService.createMerchantMembers({
          merchant_id: merchantA.merchant.id,
          actor_id: staffUser.id,
          role: "staff",
          status: "active",
        })
        const staffToken = await generateJwtToken(
          {
            actor_id: staffUser.id,
            actor_type: "user",
            auth_identity_id: "test-staff-auth-identity-a",
            app_metadata: {},
            user_metadata: {},
          },
          {
            secret: process.env.JWT_SECRET!,
            expiresIn: "1h",
          }
        )
        const limitedStaffHeaders = {
          Authorization: `Bearer ${staffToken}`,
        }

        await expect(
          api.post(
            `/admin/merchants/${merchantA.merchant.id}/uploads`,
            createProductImageForm(),
            { headers: limitedStaffHeaders }
          )
        ).rejects.toMatchObject({ response: { status: 403 } })

        await expect(
          api.post(
            `/admin/merchants/${merchantA.merchant.id}/products`,
            {
              products: [
                {
                  title: "Staff must not create this product",
                  handle: "staff-forbidden-product",
                },
              ],
            },
            { headers: limitedStaffHeaders }
          )
        ).rejects.toMatchObject({ response: { status: 403 } })

        await expect(
          api.post(
            `/admin/merchants/${merchantA.merchant.id}/delivery-options`,
            {
              ...deliveryMethodInput,
              stock_location_id: merchantA.stockLocation.id,
              shipping_profile_id: merchantA.shippingProfile.id,
            },
            { headers: limitedStaffHeaders }
          )
        ).rejects.toMatchObject({ response: { status: 403 } })

        await merchantService.updateMerchantMembers({
          id: staffMember.id,
          status: "suspended",
        })

        await expect(
          api.get("/admin/merchant-session", {
            headers: limitedStaffHeaders,
          })
        ).rejects.toMatchObject({ response: { status: 403 } })
      })

    })
  },
})
