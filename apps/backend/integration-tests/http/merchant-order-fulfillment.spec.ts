import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  ContainerRegistrationKeys,
  generateJwtToken,
  Modules,
} from "@medusajs/framework/utils"
import {
  createOrderWorkflow,
  createReservationsWorkflow,
} from "@medusajs/medusa/core-flows"

import { MERCHANT_MODULE } from "../../src/modules/merchant"
import MerchantModuleService from "../../src/modules/merchant/service"
import { createMerchantProductsWorkflow } from "../../src/workflows/merchant-catalog"
import { createMerchantDeliveryMethodWorkflow } from "../../src/workflows/merchant-delivery"
import { adjustMerchantInventoryWorkflow } from "../../src/workflows/merchant-inventory"
import { provisionMerchantWorkflow } from "../../src/workflows/provision-merchant"

jest.setTimeout(180000)

medusaIntegrationTestRunner({
  moduleName: "merchant-order-fulfillment-http",
  cwd: process.cwd(),
  testSuite: ({ api, getContainer }) => {
    describe("merchant order fulfillment", () => {
      it("supports full and repeat partial fulfillment with tenant and role enforcement", async () => {
        const container = getContainer()
        const link = container.resolve(ContainerRegistrationKeys.LINK)
        const query = container.resolve(ContainerRegistrationKeys.QUERY)
        const userService = container.resolve(Modules.USER)
        const customerService = container.resolve(Modules.CUSTOMER)
        const regionService = container.resolve(Modules.REGION)
        const merchantService =
          container.resolve<MerchantModuleService>(MERCHANT_MODULE)
        const region = await regionService.createRegions({
          name: "Fulfillment test region",
          currency_code: "kes",
          automatic_taxes: false,
          countries: ["ke"],
        })

        const provision = async (key: string) => {
          const owner = await userService.createUsers({
            email: `fulfillment-owner-${key}@example.test`,
          })
          const { result } = await provisionMerchantWorkflow(container).run({
            input: {
              name: `Fulfillment Merchant ${key}`,
              slug: `fulfillment-merchant-${key}`,
              platform_hostname: `fulfillment-${key}.shop.localhost`,
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
                name: `Delivery ${key}`,
                description: "Test delivery",
                estimated_delivery: "Tomorrow",
                country_codes: ["ke"],
                price: { amount: 0, currency_code: "kes" },
                is_enabled: true,
                is_default: true,
              },
            })
          const token = await generateJwtToken(
            {
              actor_id: owner.id,
              actor_type: "user",
              auth_identity_id: `fulfillment-owner-auth-${key}`,
              app_metadata: {},
              user_metadata: {},
            },
            { secret: process.env.JWT_SECRET!, expiresIn: "1h" }
          )

          return {
            ...result,
            owner,
            headers: { Authorization: `Bearer ${token}` },
            shippingOption: deliveryOptions[0],
          }
        }

        const merchantA = await provision("a")
        const merchantB = await provision("b")
        const registeredCustomer = await customerService.createCustomers({
          email: "registered-buyer@example.test",
          first_name: "Registered",
          last_name: "Buyer",
          phone: "+254700000001",
          company_name: "Buyer Company",
          has_account: true,
        })
        const guestCustomer = await customerService.createCustomers({
          email: "guest-buyer@example.test",
          has_account: false,
        })

        const createOrder = async (
          merchant: typeof merchantA,
          quantity: number,
          item?: {
            product_id: string
            variant_id: string
            variant_sku: string
          },
          customer?: {
            id: string
            email: string
          }
        ) => {
          const { result: order } = await createOrderWorkflow(container).run({
            input: {
              currency_code: "kes",
              region_id: region.id,
              email: customer?.email || `buyer-${orderSequence++}@example.test`,
              customer_id: customer?.id,
              sales_channel_id: merchant.salesChannel.id,
              status: "pending",
              shipping_address: {
                first_name: "Fulfillment",
                last_name: "Buyer",
                address_1: "1 Test Road",
                city: "Nairobi",
                country_code: "ke",
              },
              billing_address: {
                first_name: "Billing",
                last_name: "Buyer",
                address_1: "2 Test Road",
                city: "Nairobi",
                country_code: "ke",
              },
              items: [
                {
                  title: "Fulfillment item",
                  thumbnail: "https://example.test/fulfillment-item.jpg",
                  quantity,
                  unit_price: 100,
                  requires_shipping: true,
                  product_id: item?.product_id,
                  variant_id: item?.variant_id,
                  variant_sku: item?.variant_sku || "FULFILLMENT-SKU",
                  product_title: "Fulfillment product",
                  variant_title: "Default variant",
                },
              ],
              shipping_methods: [
                {
                  name: merchant.shippingOption.name,
                  amount: 0,
                  shipping_option_id: merchant.shippingOption.id,
                },
              ],
            },
          })

          await link.create({
            [MERCHANT_MODULE]: { merchant_id: merchant.merchant.id },
            [Modules.ORDER]: { order_id: order.id },
          })

          const { data: createdOrders } = await query.graph({
            entity: "order",
            fields: [
              "id",
              "items.id",
              "items.detail.fulfilled_quantity",
              "fulfillment_status",
              "fulfillments.id",
            ],
            filters: { id: order.id },
          })

          return createdOrders[0] as unknown as {
            id: string
            items: Array<{
              id: string
              detail: { fulfilled_quantity: number }
            }>
            fulfillment_status: string
            fulfillments: Array<{ id: string }>
          }
        }
        let orderSequence = 1

        const fullOrder = await createOrder(
          merchantA,
          2,
          undefined,
          registeredCustomer
        )
        const orderDetail = await api.get(
          `/admin/merchants/${merchantA.merchant.id}/orders/${fullOrder.id}`,
          { headers: merchantA.headers }
        )

        expect(orderDetail.status).toBe(200)
        expect(orderDetail.data.order).toMatchObject({
          customer_id: registeredCustomer.id,
          email: registeredCustomer.email,
          fulfillment_status: "not_fulfilled",
          payment_status: "not_paid",
          customer: {
            id: registeredCustomer.id,
            email: registeredCustomer.email,
            first_name: "Registered",
            last_name: "Buyer",
            phone: "+254700000001",
            company_name: "Buyer Company",
            has_account: true,
          },
          shipping_address: {
            first_name: "Fulfillment",
            address_1: "1 Test Road",
          },
          billing_address: {
            first_name: "Billing",
            address_1: "2 Test Road",
          },
          items: [
            {
              id: fullOrder.items[0].id,
              title: "Fulfillment item",
              product_title: "Fulfillment product",
              variant_title: "Default variant",
              variant_sku: "FULFILLMENT-SKU",
              thumbnail: "https://example.test/fulfillment-item.jpg",
              quantity: 2,
              unit_price: 100,
              total: 200,
              requires_shipping: true,
              product_id: null,
              variant_id: null,
              detail: {
                fulfilled_quantity: 0,
                shipped_quantity: 0,
              },
            },
          ],
        })
        expect(orderDetail.data.order.items[0].raw_quantity).toMatchObject({
          value: "2",
        })
        expect(
          orderDetail.data.order.items[0].detail.raw_fulfilled_quantity
        ).toMatchObject({ value: "0" })

        const guestOrder = await createOrder(
          merchantA,
          1,
          undefined,
          guestCustomer
        )
        const guestOrderDetail = await api.get(
          `/admin/merchants/${merchantA.merchant.id}/orders/${guestOrder.id}`,
          { headers: merchantA.headers }
        )

        expect(guestOrderDetail.data.order.customer).toMatchObject({
          id: guestCustomer.id,
          email: guestCustomer.email,
          first_name: null,
          last_name: null,
          phone: null,
          company_name: null,
          has_account: false,
        })

        const fulfillmentOptions = await api.get(
          `/admin/merchants/${merchantA.merchant.id}/orders/${fullOrder.id}/fulfillments`,
          { headers: merchantA.headers }
        )
        expect(fulfillmentOptions.status).toBe(200)
        expect(fulfillmentOptions.data.stock_locations).toEqual([
          expect.objectContaining({ id: merchantA.stockLocation.id }),
        ])
        expect(fulfillmentOptions.data.default_location_id).toBe(
          merchantA.stockLocation.id
        )

        const fullResponse = await api.post(
          `/admin/merchants/${merchantA.merchant.id}/orders/${fullOrder.id}/fulfillments`,
          {
            location_id: merchantA.stockLocation.id,
            items: [{ id: fullOrder.items[0].id, quantity: 2 }],
            no_notification: true,
          },
          { headers: merchantA.headers }
        )

        expect(fullResponse.status).toBe(200)
        const fulfilledOrder = await api.get(
          `/admin/merchants/${merchantA.merchant.id}/orders/${fullOrder.id}`,
          { headers: merchantA.headers }
        )
        expect(fulfilledOrder.data.order.fulfillment_status).toBe("fulfilled")
        expect(
          fulfilledOrder.data.order.items[0].detail.fulfilled_quantity
        ).toBe(2)
        expect(fulfilledOrder.data.order.fulfillments).toHaveLength(1)

        const fullFulfillmentId = fulfilledOrder.data.order.fulfillments[0].id
        const shipmentWithoutLabel = await api.post(
          `/admin/merchants/${merchantA.merchant.id}/orders/${fullOrder.id}/shipments`,
          {
            fulfillment_id: fullFulfillmentId,
            items: [{ id: fullOrder.items[0].id, quantity: 2 }],
          },
          { headers: merchantA.headers }
        )

        expect(shipmentWithoutLabel.status).toBe(200)
        const shippedOrder = await api.get(
          `/admin/merchants/${merchantA.merchant.id}/orders/${fullOrder.id}`,
          { headers: merchantA.headers }
        )
        expect(shippedOrder.data.order.fulfillment_status).toBe("shipped")
        expect(shippedOrder.data.order.fulfillments[0].shipped_at).toBeTruthy()

        const partialOrder = await createOrder(merchantA, 3)
        await api.post(
          `/admin/merchants/${merchantA.merchant.id}/orders/${partialOrder.id}/fulfillments`,
          {
            location_id: merchantA.stockLocation.id,
            items: [{ id: partialOrder.items[0].id, quantity: 1 }],
          },
          { headers: merchantA.headers }
        )
        const partiallyFulfilledOrder = await api.get(
          `/admin/merchants/${merchantA.merchant.id}/orders/${partialOrder.id}`,
          { headers: merchantA.headers }
        )
        expect(partiallyFulfilledOrder.data.order.fulfillment_status).toBe(
          "partially_fulfilled"
        )
        expect(
          partiallyFulfilledOrder.data.order.items[0].detail.fulfilled_quantity
        ).toBe(1)

        await api.post(
          `/admin/merchants/${merchantA.merchant.id}/orders/${partialOrder.id}/fulfillments`,
          {
            location_id: merchantA.stockLocation.id,
            items: [{ id: partialOrder.items[0].id, quantity: 2 }],
          },
          { headers: merchantA.headers }
        )
        const twiceFulfilledOrder = await api.get(
          `/admin/merchants/${merchantA.merchant.id}/orders/${partialOrder.id}`,
          { headers: merchantA.headers }
        )
        expect(twiceFulfilledOrder.data.order.fulfillment_status).toBe("fulfilled")
        expect(twiceFulfilledOrder.data.order.fulfillments).toHaveLength(2)
        expect(
          twiceFulfilledOrder.data.order.items[0].detail.fulfilled_quantity
        ).toBe(3)

        const labelOrder = await createOrder(merchantA, 1)
        await api.post(
          `/admin/merchants/${merchantA.merchant.id}/orders/${labelOrder.id}/fulfillments`,
          {
            location_id: merchantA.stockLocation.id,
            items: [{ id: labelOrder.items[0].id, quantity: 1 }],
          },
          { headers: merchantA.headers }
        )
        const fulfilledLabelOrder = await api.get(
          `/admin/merchants/${merchantA.merchant.id}/orders/${labelOrder.id}`,
          { headers: merchantA.headers }
        )
        const labelFulfillmentId =
          fulfilledLabelOrder.data.order.fulfillments[0].id

        await expect(
          api.post(
            `/admin/merchants/${merchantA.merchant.id}/orders/${labelOrder.id}/fulfillments/${labelFulfillmentId}/deliver`,
            { no_notification: true },
            { headers: merchantA.headers }
          )
        ).rejects.toMatchObject({ response: { status: 400 } })

        await expect(
          api.post(
            `/admin/merchants/${merchantA.merchant.id}/orders/${labelOrder.id}/shipments`,
            {
              fulfillment_id: labelFulfillmentId,
              items: [{ id: labelOrder.items[0].id, quantity: 1 }],
              labels: [
                {
                  tracking_number: "TRACK-INCOMPLETE",
                  tracking_url: "https://carrier.example/track/incomplete",
                },
              ],
            },
            { headers: merchantA.headers }
          )
        ).rejects.toMatchObject({ response: { status: 400 } })

        const labeledShipment = await api.post(
          `/admin/merchants/${merchantA.merchant.id}/orders/${labelOrder.id}/shipments`,
          {
            fulfillment_id: labelFulfillmentId,
            items: [{ id: labelOrder.items[0].id, quantity: 1 }],
            labels: [
              {
                tracking_number: "TRACK-COMPLETE",
                tracking_url: "https://carrier.example/track/complete",
                label_url: "https://carrier.example/labels/complete.pdf",
              },
            ],
          },
          { headers: merchantA.headers }
        )

        expect(labeledShipment.status).toBe(200)
        const labeledOrder = await api.get(
          `/admin/merchants/${merchantA.merchant.id}/orders/${labelOrder.id}`,
          { headers: merchantA.headers }
        )
        expect(labeledOrder.data.order.fulfillment_status).toBe("shipped")
        expect(labeledOrder.data.order.fulfillments[0]).toMatchObject({
          shipped_at: expect.any(String),
          labels: [
            expect.objectContaining({
              tracking_number: "TRACK-COMPLETE",
              tracking_url: "https://carrier.example/track/complete",
              label_url: "https://carrier.example/labels/complete.pdf",
            }),
          ],
        })

        const deliveredResponse = await api.post(
          `/admin/merchants/${merchantA.merchant.id}/orders/${labelOrder.id}/fulfillments/${labelFulfillmentId}/deliver`,
          { no_notification: true },
          { headers: merchantA.headers }
        )

        expect(deliveredResponse.status).toBe(200)
        const deliveredOrder = await api.get(
          `/admin/merchants/${merchantA.merchant.id}/orders/${labelOrder.id}`,
          { headers: merchantA.headers }
        )
        expect(deliveredOrder.data.order.fulfillment_status).toBe("delivered")
        expect(
          deliveredOrder.data.order.fulfillments[0].delivered_at
        ).toEqual(expect.any(String))

        const merchantOrders = await api.get(
          `/admin/merchants/${merchantA.merchant.id}/orders`,
          { headers: merchantA.headers }
        )
        const deliveredOrderListItem = merchantOrders.data.orders.find(
          (order: { id: string }) => order.id === labelOrder.id
        )

        expect(deliveredOrderListItem).toMatchObject({
          id: labelOrder.id,
          fulfillment_status: "delivered",
          fulfillments: [
            expect.objectContaining({
              id: labelFulfillmentId,
              delivered_at: expect.any(String),
            }),
          ],
        })

        await expect(
          api.post(
            `/admin/merchants/${merchantA.merchant.id}/orders/${labelOrder.id}/cancel`,
            {},
            { headers: merchantA.headers }
          )
        ).rejects.toMatchObject({ response: { status: 400 } })

        await expect(
          api.post(
            `/admin/merchants/${merchantA.merchant.id}/orders/${labelOrder.id}/fulfillments/${labelFulfillmentId}/deliver`,
            { no_notification: true },
            { headers: merchantA.headers }
          )
        ).rejects.toMatchObject({ response: { status: 400 } })

        const protectedOrder = await createOrder(merchantA, 2)
        await expect(
          api.post(
            `/admin/merchants/${merchantA.merchant.id}/orders/${protectedOrder.id}/fulfillments`,
            {
              location_id: merchantA.stockLocation.id,
              items: [{ id: protectedOrder.items[0].id, quantity: 3 }],
            },
            { headers: merchantA.headers }
          )
        ).rejects.toMatchObject({ response: { status: 400 } })

        await expect(
          api.post(
            `/admin/merchants/${merchantA.merchant.id}/orders/${protectedOrder.id}/fulfillments`,
            {
              location_id: merchantB.stockLocation.id,
              items: [{ id: protectedOrder.items[0].id, quantity: 1 }],
            },
            { headers: merchantA.headers }
          )
        ).rejects.toMatchObject({ response: { status: 404 } })

        const merchantBOrder = await createOrder(merchantB, 1)
        await expect(
          api.get(
            `/admin/merchants/${merchantA.merchant.id}/orders/${merchantBOrder.id}`,
            { headers: merchantA.headers }
          )
        ).rejects.toMatchObject({ response: { status: 404 } })

        await expect(
          api.post(
            `/admin/merchants/${merchantA.merchant.id}/orders/${merchantBOrder.id}/fulfillments/${fullFulfillmentId}/deliver`,
            { no_notification: true },
            { headers: merchantA.headers }
          )
        ).rejects.toMatchObject({ response: { status: 404 } })

        await expect(
          api.post(
            `/admin/merchants/${merchantA.merchant.id}/orders/${merchantBOrder.id}/fulfillments`,
            {
              location_id: merchantA.stockLocation.id,
              items: [{ id: merchantBOrder.items[0].id, quantity: 1 }],
            },
            { headers: merchantA.headers }
          )
        ).rejects.toMatchObject({ response: { status: 404 } })

        const staff = await userService.createUsers({
          email: "fulfillment-staff@example.test",
        })
        const staffMember = await merchantService.createMerchantMembers({
          merchant_id: merchantA.merchant.id,
          actor_id: staff.id,
          role: "staff",
          status: "active",
        })
        const staffToken = await generateJwtToken(
          {
            actor_id: staff.id,
            actor_type: "user",
            auth_identity_id: "fulfillment-staff-auth",
            app_metadata: {},
            user_metadata: {},
          },
          { secret: process.env.JWT_SECRET!, expiresIn: "1h" }
        )
        const staffHeaders = { Authorization: `Bearer ${staffToken}` }

        await expect(
          api.post(
            `/admin/merchants/${merchantA.merchant.id}/orders/${protectedOrder.id}/fulfillments`,
            {
              location_id: merchantA.stockLocation.id,
              items: [{ id: protectedOrder.items[0].id, quantity: 1 }],
            },
            { headers: staffHeaders }
          )
        ).rejects.toMatchObject({ response: { status: 403 } })

        await expect(
          api.post(
            `/admin/merchants/${merchantA.merchant.id}/orders/${fullOrder.id}/fulfillments/${fullFulfillmentId}/deliver`,
            { no_notification: true },
            { headers: staffHeaders }
          )
        ).rejects.toMatchObject({ response: { status: 403 } })

        await merchantService.updateMerchantMembers({
          id: staffMember.id,
          role: "admin",
          status: "suspended",
        })
        await expect(
          api.post(
            `/admin/merchants/${merchantA.merchant.id}/orders/${protectedOrder.id}/fulfillments`,
            {
              location_id: merchantA.stockLocation.id,
              items: [{ id: protectedOrder.items[0].id, quantity: 1 }],
            },
            { headers: staffHeaders }
          )
        ).rejects.toMatchObject({ response: { status: 404 } })

        await expect(
          api.post(
            `/admin/merchants/${merchantA.merchant.id}/orders/${fullOrder.id}/fulfillments/${fullFulfillmentId}/deliver`,
            { no_notification: true },
            { headers: staffHeaders }
          )
        ).rejects.toMatchObject({ response: { status: 404 } })

        const { result: products } = await createMerchantProductsWorkflow(
          container
        ).run({
          input: {
            merchant_id: merchantA.merchant.id,
            sales_channel_id: merchantA.salesChannel.id,
            products: [
              {
                title: "Managed fulfillment product",
                handle: "managed-fulfillment-product",
                status: "published",
                options: [{ title: "Default", values: ["Default"] }],
                variants: [
                  {
                    title: "Default",
                    sku: "MANAGED-FULFILLMENT",
                    manage_inventory: true,
                    options: { Default: "Default" },
                    prices: [{ amount: 25, currency_code: "kes" }],
                  },
                ],
              },
            ],
          },
        })
        const { data: variantData } = await query.graph({
          entity: "product_variant",
          fields: ["id", "sku", "inventory.id"],
          filters: { product_id: products[0].id },
        })
        const variant = variantData[0] as unknown as {
          id: string
          sku: string
          inventory: Array<{ id: string }>
        }
        const inventoryItemId = variant.inventory[0].id

        await adjustMerchantInventoryWorkflow(container).run({
          input: {
            merchant_id: merchantA.merchant.id,
            sales_channel_id: merchantA.salesChannel.id,
            create: [
              {
                inventory_item_id: inventoryItemId,
                location_id: merchantA.stockLocation.id,
                stocked_quantity: 10,
              },
            ],
          },
        })
        const managedOrder = await createOrder(merchantA, 2, {
          product_id: products[0].id,
          variant_id: variant.id,
          variant_sku: variant.sku,
        })

        await createReservationsWorkflow(container).run({
          input: {
            reservations: [
              {
                line_item_id: managedOrder.items[0].id,
                inventory_item_id: inventoryItemId,
                location_id: merchantA.stockLocation.id,
                quantity: 2,
              },
            ],
          },
        })
        await api.post(
          `/admin/merchants/${merchantA.merchant.id}/orders/${managedOrder.id}/fulfillments`,
          {
            location_id: merchantA.stockLocation.id,
            items: [{ id: managedOrder.items[0].id, quantity: 2 }],
          },
          { headers: merchantA.headers }
        )

        const [managedOrderResponse, { data: inventoryLevelData }] =
          await Promise.all([
            api.get(
              `/admin/merchants/${merchantA.merchant.id}/orders/${managedOrder.id}`,
              { headers: merchantA.headers }
            ),
            query.graph({
              entity: "inventory_level",
              fields: [
                "stocked_quantity",
                "reserved_quantity",
                "available_quantity",
              ],
              filters: {
                inventory_item_id: inventoryItemId,
                location_id: merchantA.stockLocation.id,
              },
            }),
          ])

        expect(managedOrderResponse.data.order).toMatchObject({
          fulfillment_status: "fulfilled",
          items: [{ detail: { fulfilled_quantity: 2 } }],
        })
        expect(Number(inventoryLevelData[0].stocked_quantity)).toBe(8)
        expect(Number(inventoryLevelData[0].reserved_quantity)).toBe(0)
        expect(Number(inventoryLevelData[0].available_quantity)).toBe(8)
      })
    })
  },
})
