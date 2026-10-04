import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  ContainerRegistrationKeys,
  generateJwtToken,
  Modules,
} from "@medusajs/framework/utils"

import { MERCHANT_MODULE } from "../../src/modules/merchant"
import type MerchantModuleService from "../../src/modules/merchant/service"
import { createMerchantProductsWorkflow } from "../../src/workflows/merchant-catalog"
import { provisionMerchantWorkflow } from "../../src/workflows/provision-merchant"
import {
  createMerchantAFixture,
  createMerchantBFixture,
} from "../helpers/merchant-fixtures"

jest.setTimeout(180000)

const tokenFor = (actorId: string, authIdentityId: string) =>
  generateJwtToken(
    {
      actor_id: actorId,
      actor_type: "user",
      auth_identity_id: authIdentityId,
      app_metadata: {},
      user_metadata: {},
    },
    { secret: process.env.JWT_SECRET!, expiresIn: "1h" }
  )

type StoreCart = {
  id: string
  discount_total: number
  promotions: Array<{ code: string }>
}

// Merchant promotions are Medusa's own, scoped to one shop: other shops
// can't see or change them, their codes don't work in other shops' carts,
// and automatic ones only apply in their own shop.
medusaIntegrationTestRunner({
  moduleName: "merchant-platform-promotions",
  cwd: process.cwd(),
  testSuite: ({ api, getContainer }) => {
    describe("merchant promotions", () => {
      it("keep promotions and campaigns inside their own shop", async () => {
        const container = getContainer()
        const query = container.resolve(ContainerRegistrationKeys.QUERY)
        const userService = container.resolve(Modules.USER)
        const regionService = container.resolve(Modules.REGION)
        const merchantService =
          container.resolve<MerchantModuleService>(MERCHANT_MODULE)
        const fixtureA = createMerchantAFixture()
        const fixtureB = createMerchantBFixture()
        const region = await regionService.createRegions({
          name: "Promotions region",
          currency_code: "kes",
          automatic_taxes: false,
          countries: ["ke"],
        })

        const provision = async (
          fixture: ReturnType<typeof createMerchantAFixture>,
          key: string
        ) => {
          const owner = await userService.createUsers({
            email: fixture.owner.email,
          })
          const { result } = await provisionMerchantWorkflow(container).run({
            input: {
              name: fixture.merchant.name,
              slug: fixture.merchant.slug,
              platform_hostname: fixture.domain.hostname,
              owner_actor_id: owner.id,
            },
          })
          const { result: products } = await createMerchantProductsWorkflow(
            container
          ).run({
            input: {
              merchant_id: result.merchant.id,
              sales_channel_id: result.salesChannel.id,
              products: [
                {
                  title: `${key} product`,
                  handle: `${key}-promotion-product`,
                  status: "published",
                  options: [{ title: "Default", values: ["Default"] }],
                  variants: [
                    {
                      title: "Default",
                      manage_inventory: false,
                      options: { Default: "Default" },
                      prices: [{ amount: 1000, currency_code: "kes" }],
                    },
                  ],
                },
              ],
            },
          })

          return {
            ...result,
            product: products[0],
            path: `/admin/merchants/${result.merchant.id}`,
            headers: {
              Authorization: `Bearer ${await tokenFor(owner.id, `promo-owner-${key}`)}`,
            },
            store: {
              Host: fixture.domain.hostname,
              "x-publishable-api-key": result.publishableApiKey.token,
            },
          }
        }

        const shopA = await provision(fixtureA, "a")
        const shopB = await provision(fixtureB, "b")
        const staff = await userService.createUsers({
          email: "promo-staff@test.local",
        })
        await merchantService.createMerchantMembers({
          merchant_id: shopA.merchant.id,
          actor_id: staff.id,
          role: "staff",
          status: "active",
        })
        const staffHeaders = {
          Authorization: `Bearer ${await tokenFor(staff.id, "promo-staff")}`,
        }
        const {
          data: { customer_segment: vip },
        } = await api.post(
          `${shopA.path}/customer-segments`,
          { name: "VIP" },
          { headers: shopA.headers }
        )

        const tenPercent = {
          code: " vip10 ",
          type: "standard",
          status: "active",
          application_method: {
            type: "percentage",
            target_type: "items",
            value: 10,
          },
          target_rules: [
            {
              attribute: "items.product.id",
              operator: "in",
              values: [shopA.product.id],
            },
          ],
        }

        // Staff can see promotions but not create them.
        await expect(
          api.post(`${shopA.path}/promotions`, tenPercent, {
            headers: staffHeaders,
          })
        ).rejects.toMatchObject({ response: { status: 403 } })

        const {
          data: { promotion: vip10 },
        } = await api.post(`${shopA.path}/promotions`, tenPercent, {
          headers: shopA.headers,
        })
        expect(vip10).toMatchObject({
          code: "VIP10",
          status: "active",
          is_automatic: false,
          application_method: {
            type: "percentage",
            target_type: "items",
            allocation: "across",
            value: 10,
            currency_code: "kes",
          },
          rules: [],
          target_rules: [
            {
              attribute: "items.product.id",
              operator: "in",
              values: [{ value: shopA.product.id, label: "a product" }],
            },
          ],
        })

        // The hidden rule keeps it in shop A's sales channel.
        const { data: stored } = await query.graph({
          entity: "promotion",
          fields: ["rules.attribute", "rules.values.value"],
          filters: { id: vip10.id },
        })
        expect(
          (stored[0] as { rules: Array<{ attribute: string; values: Array<{ value: string }> }> }).rules
        ).toEqual([
          expect.objectContaining({
            attribute: "sales_channel_id",
            values: [expect.objectContaining({ value: shopA.salesChannel.id })],
          }),
        ])

        // Codes are unique on the platform; shop B gets a suggestion.
        await expect(
          api.post(
            `${shopB.path}/promotions`,
            { ...tenPercent, target_rules: [] },
            { headers: shopB.headers }
          )
        ).rejects.toMatchObject({
          response: {
            data: {
              message: expect.stringContaining(
                "VIP10 is already used on this platform. Try another, like VIP10-"
              ),
            },
          },
        })
        // Shop B can't aim a promotion at shop A's products or segments.
        await expect(
          api.post(
            `${shopB.path}/promotions`,
            { ...tenPercent, code: "BSALE" },
            { headers: shopB.headers }
          )
        ).rejects.toMatchObject({ response: { status: 404 } })
        await expect(
          api.post(
            `${shopB.path}/promotions`,
            {
              ...tenPercent,
              code: "BVIP",
              target_rules: [],
              rules: [
                { attribute: "customer.groups.id", operator: "in", values: [vip.id] },
              ],
            },
            { headers: shopB.headers }
          )
        ).rejects.toMatchObject({ response: { status: 404 } })
        // Or at the platform: only the merchant's own conditions are allowed.
        await expect(
          api.post(
            `${shopB.path}/promotions`,
            {
              ...tenPercent,
              code: "BCHANNEL",
              target_rules: [],
              rules: [
                {
                  attribute: "sales_channel_id",
                  operator: "in",
                  values: [shopA.salesChannel.id],
                },
              ],
            },
            { headers: shopB.headers }
          )
        ).rejects.toMatchObject({ response: { status: 400 } })

        const {
          data: { promotion: auto50 },
        } = await api.post(
          `${shopA.path}/promotions`,
          {
            code: "AUTO50",
            type: "standard",
            status: "active",
            is_automatic: true,
            application_method: {
              type: "fixed",
              target_type: "order",
              value: 50,
              currency_code: "kes",
            },
          },
          { headers: shopA.headers }
        )
        expect(auto50.application_method).toMatchObject({
          allocation: "across",
          max_quantity: null,
        })

        // A new campaign can come with the promotion.
        const {
          data: { promotion: welcome },
        } = await api.post(
          `${shopA.path}/promotions`,
          {
            code: "KARIBU",
            type: "standard",
            status: "draft",
            application_method: {
              type: "fixed",
              target_type: "items",
              allocation: "each",
              value: 100,
              currency_code: "kes",
              max_quantity: 2,
            },
            campaign: {
              name: "Welcome",
              budget: { type: "usage", limit: 100 },
            },
          },
          { headers: shopA.headers }
        )
        expect(welcome.campaign).toMatchObject({
          name: "Welcome",
          status: "active",
          budget: { type: "usage", limit: 100, used: 0 },
        })

        // Each shop lists and opens only its own promotions.
        const listA = await api.get(`${shopA.path}/promotions`, {
          headers: staffHeaders,
        })
        expect(listA.data).toMatchObject({ count: 3, currency_codes: ["kes"] })
        expect(
          listA.data.promotions.map(({ code }: { code: string }) => code).sort()
        ).toEqual(["AUTO50", "KARIBU", "VIP10"])
        const listB = await api.get(`${shopB.path}/promotions`, {
          headers: shopB.headers,
        })
        expect(listB.data.count).toBe(0)
        await expect(
          api.get(`${shopB.path}/promotions/${vip10.id}`, {
            headers: shopB.headers,
          })
        ).rejects.toMatchObject({ response: { status: 404 } })
        await expect(
          api.post(
            `${shopB.path}/promotions/${vip10.id}`,
            { status: "inactive" },
            { headers: shopB.headers }
          )
        ).rejects.toMatchObject({ response: { status: 404 } })

        // Shop A's codes and automatic promotions work in shop A's carts.
        const createCart = async (shop: typeof shopA) => {
          const { data } = await api.post(
            "/store/carts",
            {
              region_id: region.id,
              items: [{ variant_id: shop.product.variants[0].id, quantity: 2 }],
            },
            { headers: shop.store }
          )
          return data.cart as StoreCart
        }
        const cartA = await createCart(shopA)
        const {
          data: { cart: withCode },
        } = await api.post(
          `/store/carts/${cartA.id}/promotions`,
          { promo_codes: ["vip10"] },
          { headers: shopA.store }
        )
        expect(
          (withCode as StoreCart).promotions.map(({ code }) => code).sort()
        ).toEqual(["AUTO50", "VIP10"])
        // KES 50 off the order, then 10% of the KES 1,950 left.
        expect((withCode as StoreCart).discount_total).toBe(245)

        // In shop B's carts, shop A's automatic promotion never applies and
        // its code reads as invalid.
        const cartB = await createCart(shopB)
        const {
          data: { cart: refreshedB },
        } = await api.post(
          `/store/carts/${cartB.id}`,
          { email: "shopper@example.test" },
          { headers: shopB.store }
        )
        expect((refreshedB as StoreCart).promotions).toEqual([])
        expect((refreshedB as StoreCart).discount_total).toBe(0)
        for (const [path, code] of [
          [`/store/carts/${cartB.id}/promotions`, "VIP10"],
          [`/store/carts/${cartB.id}`, "vip10"],
        ] as const) {
          await expect(
            api.post(path, { promo_codes: [code] }, { headers: shopB.store })
          ).rejects.toMatchObject({
            response: {
              status: 400,
              data: { message: `The promotion code ${code} is invalid` },
            },
          })
        }
        await expect(
          api.post(
            "/store/carts",
            {
              region_id: region.id,
              promo_codes: ["VIP10"],
              items: [{ variant_id: shopB.product.variants[0].id, quantity: 1 }],
            },
            { headers: shopB.store }
          )
        ).rejects.toMatchObject({ response: { status: 400 } })

        // Updating: limit it to VIP customers. The hidden rule stays.
        const {
          data: { promotion: updated },
        } = await api.post(
          `${shopA.path}/promotions/${vip10.id}`,
          {
            application_method: { value: 15 },
            rules: [
              { attribute: "customer.groups.id", operator: "in", values: [vip.id] },
            ],
          },
          { headers: shopA.headers }
        )
        expect(updated).toMatchObject({
          application_method: { value: 15, allocation: "across" },
          rules: [
            {
              attribute: "customer.groups.id",
              values: [{ value: vip.id, label: "VIP" }],
            },
          ],
          target_rules: [{ values: [{ value: shopA.product.id }] }],
        })
        const { data: afterUpdate } = await query.graph({
          entity: "promotion",
          fields: ["rules.attribute"],
          filters: { id: vip10.id },
        })
        expect(
          (afterUpdate[0] as { rules: Array<{ attribute: string }> }).rules
            .map(({ attribute }) => attribute)
            .sort()
        ).toEqual(["customer.groups.id", "sales_channel_id"])

        // Campaigns: create, add a promotion, and keep them per shop.
        await expect(
          api.post(
            `${shopA.path}/campaigns`,
            { name: "Black Friday" },
            { headers: staffHeaders }
          )
        ).rejects.toMatchObject({ response: { status: 403 } })
        const {
          data: { campaign: blackFriday },
        } = await api.post(
          `${shopA.path}/campaigns`,
          {
            name: "Black Friday",
            starts_at: "2030-11-28T00:00:00.000Z",
            ends_at: "2030-11-30T23:59:59.000Z",
            budget: { type: "spend", limit: 5000, currency_code: "kes" },
          },
          { headers: shopA.headers }
        )
        expect(blackFriday).toMatchObject({
          name: "Black Friday",
          status: "scheduled",
          budget: { type: "spend", limit: 5000, currency_code: "kes" },
          promotions: [],
        })
        await expect(
          api.post(
            `${shopA.path}/campaigns`,
            { name: "  black   friday " },
            { headers: shopA.headers }
          )
        ).rejects.toMatchObject({
          response: {
            data: {
              message: "You already have a campaign called black friday",
            },
          },
        })
        // Shop B can use the same campaign name.
        await api.post(
          `${shopB.path}/campaigns`,
          { name: "Black Friday" },
          { headers: shopB.headers }
        )
        const {
          data: { campaign: withPromotion },
        } = await api.post(
          `${shopA.path}/campaigns/${blackFriday.id}/promotions`,
          { add: [vip10.id] },
          { headers: shopA.headers }
        )
        expect(withPromotion).toMatchObject({
          promotion_count: 1,
          promotions: [{ id: vip10.id, code: "VIP10" }],
        })
        const campaignsA = await api.get(`${shopA.path}/campaigns`, {
          headers: shopA.headers,
        })
        expect(
          campaignsA.data.campaigns.map(({ name }: { name: string }) => name).sort()
        ).toEqual(["Black Friday", "Welcome"])
        await expect(
          api.get(`${shopB.path}/campaigns/${blackFriday.id}`, {
            headers: shopB.headers,
          })
        ).rejects.toMatchObject({ response: { status: 404 } })
        await expect(
          api.post(
            `${shopB.path}/campaigns/${blackFriday.id}/promotions`,
            { remove: [vip10.id] },
            { headers: shopB.headers }
          )
        ).rejects.toMatchObject({ response: { status: 404 } })

        const {
          data: { campaign: renamed },
        } = await api.post(
          `${shopA.path}/campaigns/${blackFriday.id}`,
          { name: "Black Friday 2030", budget: { limit: 8000 } },
          { headers: shopA.headers }
        )
        expect(renamed).toMatchObject({
          name: "Black Friday 2030",
          budget: { limit: 8000 },
        })

        // Deleting removes it from the shop; another shop can't delete it.
        await expect(
          api.delete(`${shopB.path}/promotions/${auto50.id}`, {
            headers: shopB.headers,
          })
        ).rejects.toMatchObject({ response: { status: 404 } })
        await api.delete(`${shopA.path}/promotions/${auto50.id}`, {
          headers: shopA.headers,
        })
        await api.delete(`${shopA.path}/campaigns/${blackFriday.id}`, {
          headers: shopA.headers,
        })
        const afterDelete = await api.get(`${shopA.path}/promotions`, {
          headers: shopA.headers,
        })
        expect(
          afterDelete.data.promotions.map(({ code }: { code: string }) => code).sort()
        ).toEqual(["KARIBU", "VIP10"])
        expect(
          afterDelete.data.promotions.find(
            ({ code }: { code: string }) => code === "VIP10"
          ).campaign
        ).toBeNull()
      })
    })
  },
})
