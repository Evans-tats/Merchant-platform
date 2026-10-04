import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  ContainerRegistrationKeys,
  generateJwtToken,
  Modules,
} from "@medusajs/framework/utils"
import {
  cancelOrderWorkflow,
  createOrderWorkflow,
} from "@medusajs/medusa/core-flows"

import { MERCHANT_MODULE } from "../../src/modules/merchant"
import { runStoreAssistantTool } from "../../src/services/store-assistant/tools"
import type { ResolvedMerchantId } from "../../src/services/tenant-resolution"
import { createMerchantDeliveryMethodWorkflow } from "../../src/workflows/merchant-delivery"
import { recordMerchantActivityWorkflow } from "../../src/workflows/merchant-insights"
import { provisionMerchantWorkflow } from "../../src/workflows/provision-merchant"

jest.setTimeout(180000)

// Runs the assistant's tools against a real database to prove each one only
// sees the signed-in merchant's data and never sends contact details.
medusaIntegrationTestRunner({
  moduleName: "merchant-platform-store-assistant-tools",
  cwd: process.cwd(),
  testSuite: ({ api, getContainer }) => {
    describe("store assistant tools", () => {
      it("read only the merchant's own orders, customers and settings", async () => {
        const container = getContainer()
        const link = container.resolve(ContainerRegistrationKeys.LINK)
        const query = container.resolve(ContainerRegistrationKeys.QUERY)
        const userService = container.resolve(Modules.USER)
        const customerService = container.resolve(Modules.CUSTOMER)
        const regionService = container.resolve(Modules.REGION)
        const region = await regionService.createRegions({
          name: "Assistant tools region",
          currency_code: "kes",
          automatic_taxes: false,
          countries: ["ke"],
        })

        const provision = async (key: string) => {
          const owner = await userService.createUsers({
            email: `tools-owner-${key}@example.test`,
          })
          const { result } = await provisionMerchantWorkflow(container).run({
            input: {
              name: `Tools Merchant ${key}`,
              slug: `tools-merchant-${key}`,
              platform_hostname: `tools-${key}.shop.localhost`,
              owner_actor_id: owner.id,
            },
          })
          const { result: deliveryOptions } =
            await createMerchantDeliveryMethodWorkflow(container).run({
              input: {
                merchant_id: result.merchant.id,
                sales_channel_id: result.salesChannel.id,
                stock_location_id: result.stockLocation.id,
                shipping_profile_id: result.shippingProfile.id,
                name: `Nairobi delivery ${key}`,
                description: "Same day in Nairobi",
                estimated_delivery: "Same day",
                country_codes: ["ke"],
                price: { amount: 300, currency_code: "kes" },
                is_enabled: true,
                is_default: true,
              },
            })

          const token = await generateJwtToken(
            {
              actor_id: owner.id,
              actor_type: "user",
              auth_identity_id: `tools-owner-auth-${key}`,
              app_metadata: {},
              user_metadata: {},
            },
            { secret: process.env.JWT_SECRET!, expiresIn: "1h" }
          )

          return {
            ...result,
            headers: { Authorization: `Bearer ${token}` },
            shippingOption: deliveryOptions[0],
            context: {
              container,
              merchant_id: result.merchant.id as ResolvedMerchantId,
              sales_channel_id: result.salesChannel.id,
              role: "owner" as const,
              // These read tools never suggest changes.
              propose: async () => {
                throw new Error("Unexpected suggestion")
              },
            },
          }
        }

        const merchantA = await provision("a")
        const merchantB = await provision("b")
        const emptyMerchant = await provision("empty")
        const buyer = await customerService.createCustomers({
          email: "amina.otieno@example.test",
          first_name: "Amina",
          last_name: "Otieno",
          phone: "+254700000123",
          has_account: true,
        })

        const createOrder = async (
          merchant: typeof merchantA,
          customer?: { id: string; email: string }
        ) => {
          const { result: order } = await createOrderWorkflow(container).run({
            input: {
              currency_code: "kes",
              region_id: region.id,
              email: customer?.email ?? "guest-buyer@example.test",
              customer_id: customer?.id,
              sales_channel_id: merchant.salesChannel.id,
              status: "pending",
              shipping_address: {
                first_name: "Amina",
                last_name: "Otieno",
                address_1: "12 Moi Avenue",
                phone: "+254700000123",
                city: "Nairobi",
                country_code: "ke",
              },
              items: [
                {
                  title: "Kikoi",
                  quantity: 2,
                  unit_price: 1100,
                  requires_shipping: true,
                  product_title: "Kikoi",
                  variant_title: "Blue",
                },
              ],
              shipping_methods: [
                {
                  name: merchant.shippingOption.name,
                  amount: 300,
                  shipping_option_id: merchant.shippingOption.id,
                },
              ],
            },
          })

          await link.create({
            [MERCHANT_MODULE]: { merchant_id: merchant.merchant.id },
            [Modules.ORDER]: { order_id: order.id },
          })

          const { data } = await query.graph({
            entity: "order",
            fields: ["id", "display_id"],
            filters: { id: order.id },
          })

          return data[0] as unknown as { id: string; display_id: number }
        }

        const firstOrder = await createOrder(merchantA, buyer)
        const secondOrder = await createOrder(merchantA, buyer)
        const canceledOrder = await createOrder(merchantA)
        await cancelOrderWorkflow(container).run({
          input: { order_id: canceledOrder.id },
        })
        const otherMerchantOrder = await createOrder(merchantB)

        // All orders: newest first, only merchant A's.
        const all = await runStoreAssistantTool("list_orders", {}, merchantA.context)
        expect(all.error).toBeUndefined()
        expect(all.result).toMatchObject({ total_orders: 3 })
        const allNumbers = (all.result as { orders: Array<{ order_number: number }> })
          .orders.map(({ order_number }) => order_number)
        expect(allNumbers).toEqual([
          canceledOrder.display_id,
          secondOrder.display_id,
          firstOrder.display_id,
        ])
        expect(allNumbers).not.toContain(otherMerchantOrder.display_id)

        // Orders to fulfil leave out the canceled one.
        const toFulfil = await runStoreAssistantTool(
          "list_orders",
          { needs: "fulfillment" },
          merchantA.context
        )
        expect(toFulfil.error).toBeUndefined()
        expect(toFulfil.result).toMatchObject({
          total_matching: 2,
          orders: [
            { order_number: secondOrder.display_id, customer: "Amina Otieno" },
            { order_number: firstOrder.display_id },
          ],
        })

        // A store with no orders sees none, not everyone else's. The sales
        // summary passes order ids the same way, so check it too.
        const empty = await runStoreAssistantTool("list_orders", {}, emptyMerchant.context)
        expect(empty.result).toEqual({ total_orders: 0, orders: [] })
        const emptySales = await runStoreAssistantTool(
          "get_sales_summary",
          { range: "7d" },
          emptyMerchant.context
        )
        expect(emptySales.result).toMatchObject({ summary: { orders: 0 } })

        // The orders page gets every order, with what its cancel button needs.
        const ordersPage = await api.get(
          `/admin/merchants/${merchantA.merchant.id}/orders`,
          { headers: merchantA.headers }
        )
        expect(ordersPage.data.count).toBe(3)
        expect(
          ordersPage.data.orders.map(({ id }: { id: string }) => id).sort()
        ).toEqual([firstOrder.id, secondOrder.id, canceledOrder.id].sort())
        expect(ordersPage.data.orders[0]).toEqual(
          expect.objectContaining({
            display_id: canceledOrder.display_id,
            status: "canceled",
            fulfillment_status: expect.any(String),
            total: expect.any(Number),
            fulfillments: [],
          })
        )

        // All-time product sales skip the canceled order.
        const performance = await runStoreAssistantTool(
          "get_product_performance",
          {},
          merchantA.context
        )
        expect(performance.result).toMatchObject({
          all_time_totals: { active_order_count: 2, canceled_order_count: 1 },
          products: [{ title: "Kikoi", quantity: 4, revenue: 4400 }],
        })

        // Order details by number, with the area but no street or phone.
        const details = await runStoreAssistantTool(
          "get_order_details",
          { order_number: firstOrder.display_id },
          merchantA.context
        )
        expect(details.error).toBeUndefined()
        expect(details.result).toMatchObject({
          order_number: firstOrder.display_id,
          items: [{ name: "Kikoi (Blue)", quantity: 2, unit_price: 1100, total: 2200 }],
          delivery: { methods: ["Nairobi delivery a"], area: "Nairobi, KE" },
          customer: { name: "Amina Otieno", email: "a***@example.test" },
        })
        expect(JSON.stringify(details.result)).not.toContain("Moi Avenue")
        expect(JSON.stringify(details.result)).not.toContain("+254")

        // Another merchant's order number isn't found.
        await expect(
          runStoreAssistantTool(
            "get_order_details",
            { order_number: otherMerchantOrder.display_id },
            merchantA.context
          )
        ).resolves.toEqual({
          error: `There is no order #${otherMerchantOrder.display_id} in this store`,
        })

        // Customers: names and order counts, masked email, no phone.
        const customers = await runStoreAssistantTool(
          "list_customers",
          { sort: "most_orders" },
          merchantA.context
        )
        expect(customers.result).toMatchObject({
          total_customers: 2,
          repeat_customers: 1,
          customers: [
            {
              customer_id: buyer.id,
              name: "Amina Otieno",
              email: "a***@example.test",
              order_count: 2,
            },
            { email: "g***@example.test", order_count: 1, registered: false },
          ],
        })
        expect(JSON.stringify(customers.result)).not.toContain("+254")
        expect(JSON.stringify(customers.result)).not.toContain("amina.otieno@")
        const otherCustomers = await runStoreAssistantTool(
          "list_customers",
          {},
          merchantB.context
        )
        expect(JSON.stringify(otherCustomers.result)).not.toContain(buyer.id)

        // The customers page gets what each customer spent: 2 x 1100 plus
        // 300 delivery per order, with the canceled order left out.
        const customersPage = await api.get(
          `/admin/merchants/${merchantA.merchant.id}/customers`,
          { headers: merchantA.headers }
        )
        expect(customersPage.data.customers).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              customer_id: buyer.id,
              placed_order_count: 2,
              total_spent: 5000,
              currency_code: "kes",
            }),
            expect.objectContaining({
              email: "guest-buyer@example.test",
              order_count: 1,
              placed_order_count: 0,
              total_spent: 0,
            }),
          ])
        )

        // One customer in full, without contact details.
        const amina = await runStoreAssistantTool(
          "get_customer_details",
          { customer_id: buyer.id },
          merchantA.context
        )
        expect(amina.error).toBeUndefined()
        expect(amina.result).toMatchObject({
          customer_id: buyer.id,
          name: "Amina Otieno",
          email: "a***@example.test",
          placed_order_count: 2,
          total_spent: 5000,
          average_order_value: 2500,
          currency_code: "kes",
          top_products: [{ name: "Kikoi", quantity: 4 }],
        })
        expect(JSON.stringify(amina.result)).not.toContain("+254")
        expect(JSON.stringify(amina.result)).not.toContain("amina.otieno@")
        await expect(
          runStoreAssistantTool(
            "get_customer_details",
            { customer_id: buyer.id },
            merchantB.context
          )
        ).resolves.toEqual({ error: "Merchant customer not found" })

        // The analysis counts placed orders only.
        const analysis = await runStoreAssistantTool(
          "analyze_customers",
          { group: "repeat" },
          merchantA.context
        )
        expect(analysis.result).toMatchObject({
          customers: 2,
          buyers: 1,
          no_placed_orders: 1,
          revenue: 5000,
          average_order_value: 2500,
          currency_code: "kes",
          group: {
            total: 1,
            customers: [
              { customer_id: buyer.id, placed_orders: 2, total_spent: 5000 },
            ],
          },
        })
        const emptyAnalysis = await runStoreAssistantTool(
          "analyze_customers",
          {},
          emptyMerchant.context
        )
        expect(emptyAnalysis.result).toMatchObject({ customers: 0, revenue: 0 })

        // Delivery methods are the merchant's own.
        const delivery = await runStoreAssistantTool(
          "list_delivery_methods",
          {},
          merchantA.context
        )
        expect(delivery.result).toEqual({
          delivery_methods: [
            expect.objectContaining({
              name: "Nairobi delivery a",
              price: { amount: 300, currency_code: "kes" },
              countries: ["ke"],
            }),
          ],
        })

        // Catalog structure and segments run in scope, even when empty.
        await expect(
          runStoreAssistantTool("get_catalog_structure", {}, merchantA.context)
        ).resolves.toEqual({ result: { categories: [], collections: [] } })
        await expect(
          runStoreAssistantTool("list_customer_segments", {}, merchantA.context)
        ).resolves.toEqual({ result: { total_segments: 0, segments: [] } })

        // Recent activity is the merchant's own, newest first.
        for (const description of ["Created category Shoes", "Published Kikoi"]) {
          await recordMerchantActivityWorkflow(container).run({
            input: {
              merchant_id: merchantA.merchant.id,
              sales_channel_id: merchantA.salesChannel.id,
              action: "catalog.updated",
              resource_type: "product",
              description,
            },
          })
        }
        await recordMerchantActivityWorkflow(container).run({
          input: {
            merchant_id: merchantB.merchant.id,
            sales_channel_id: merchantB.salesChannel.id,
            action: "catalog.updated",
            resource_type: "product",
            description: "Merchant B change",
          },
        })
        const activity = await runStoreAssistantTool(
          "get_recent_activity",
          { days: 1 },
          merchantA.context
        )
        const descriptions = (
          activity.result as { activities: Array<{ description: string }> }
        ).activities.map(({ description }) => description)
        expect(descriptions.slice(0, 2)).toEqual([
          "Published Kikoi",
          "Created category Shoes",
        ])
        expect(descriptions).not.toContain("Merchant B change")
      })
    })
  },
})
