import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  ContainerRegistrationKeys,
  generateJwtToken,
  Modules,
} from "@medusajs/framework/utils"
import {
  createOrderPaymentCollectionWorkflow,
  createOrderWorkflow,
  createPaymentSessionsWorkflow,
} from "@medusajs/medusa/core-flows"

import { MERCHANT_MODULE } from "../../src/modules/merchant"
import type MerchantModuleService from "../../src/modules/merchant/service"
import { provisionMerchantWorkflow } from "../../src/workflows/provision-merchant"

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

// Payments are manual until M-Pesa takes them: checkout authorizes the
// payment and the merchant marks the order as paid once the money arrives.
medusaIntegrationTestRunner({
  moduleName: "merchant-platform-order-payments",
  cwd: process.cwd(),
  testSuite: ({ api, getContainer }) => {
    describe("merchant order payments", () => {
      it("lets owners mark their own order as paid, once", async () => {
        const container = getContainer()
        const link = container.resolve(ContainerRegistrationKeys.LINK)
        const query = container.resolve(ContainerRegistrationKeys.QUERY)
        const userService = container.resolve(Modules.USER)
        const regionService = container.resolve(Modules.REGION)
        const paymentService = container.resolve(Modules.PAYMENT)
        const merchantService =
          container.resolve<MerchantModuleService>(MERCHANT_MODULE)

        const provision = async (key: string) => {
          const owner = await userService.createUsers({
            email: `payments-owner-${key}@example.test`,
          })
          const { result } = await provisionMerchantWorkflow(container).run({
            input: {
              name: `Payments Merchant ${key}`,
              slug: `payments-merchant-${key}`,
              platform_hostname: `payments-${key}.shop.localhost`,
              owner_actor_id: owner.id,
            },
          })

          return {
            ...result,
            path: `/admin/merchants/${result.merchant.id}`,
            headers: {
              Authorization: `Bearer ${await tokenFor(owner.id, `payments-owner-${key}`)}`,
            },
          }
        }
        const merchantA = await provision("a")
        const merchantB = await provision("b")
        const staff = await userService.createUsers({
          email: "payments-staff@example.test",
        })
        await merchantService.createMerchantMembers({
          merchant_id: merchantA.merchant.id,
          actor_id: staff.id,
          role: "staff",
          status: "active",
        })
        const staffHeaders = {
          Authorization: `Bearer ${await tokenFor(staff.id, "payments-staff")}`,
        }
        const region = await regionService.createRegions({
          name: "Payments region",
          currency_code: "kes",
          automatic_taxes: false,
          countries: ["ke"],
        })

        // An order paid at checkout with the manual provider: the payment is
        // authorized but not captured.
        const { result: order } = await createOrderWorkflow(container).run({
          input: {
            currency_code: "kes",
            region_id: region.id,
            email: "buyer@example.test",
            sales_channel_id: merchantA.salesChannel.id,
            status: "pending",
            items: [
              {
                title: "Kikoi",
                quantity: 1,
                unit_price: 6600,
                product_title: "Kikoi",
              },
            ],
          },
        })
        await link.create({
          [MERCHANT_MODULE]: { merchant_id: merchantA.merchant.id },
          [Modules.ORDER]: { order_id: order.id },
        })
        const {
          result: [collection],
        } = await createOrderPaymentCollectionWorkflow(container).run({
          input: { order_id: order.id, amount: 6600 },
        })
        const { result: session } = await createPaymentSessionsWorkflow(
          container
        ).run({
          input: {
            payment_collection_id: collection.id,
            provider_id: "pp_system_default",
          },
        })
        const payment = (await paymentService.authorizePaymentSession(
          session.id,
          {}
        ))!
        const paymentState = async () => {
          const { data } = await query.graph({
            entity: "payment",
            fields: ["captured_at", "captures.amount"],
            filters: { id: payment.id },
          })
          return data[0] as {
            captured_at: Date | string | null
            captures: Array<{ amount: number }>
          }
        }
        const capturePath = (merchantPath: string) =>
          `${merchantPath}/orders/${order.id}/payments/${payment.id}/capture`
        // The orders list is what the home page and the assistant count from.
        const listedOrder = async () => {
          const { data } = await api.get(`${merchantA.path}/orders`, {
            headers: merchantA.headers,
          })
          return (
            data.orders as Array<{
              id: string
              display_id: number
              payment_status: string
            }>
          ).find(({ id }) => id === order.id)!
        }

        expect((await paymentState()).captured_at).toBeNull()
        expect((await listedOrder()).payment_status).toBe("authorized")

        // The order page shows the payment as waiting.
        const detail = await api.get(`${merchantA.path}/orders/${order.id}`, {
          headers: merchantA.headers,
        })
        expect(
          detail.data.order.payment_collections[0].payments[0]
        ).toMatchObject({ id: payment.id, captured_at: null, canceled_at: null })

        // Staff can see the order but can't mark it as paid.
        await expect(
          api.post(capturePath(merchantA.path), {}, { headers: staffHeaders })
        ).rejects.toMatchObject({ response: { status: 403 } })

        // Another shop can't reach it through either URL.
        await expect(
          api.post(capturePath(merchantA.path), {}, {
            headers: merchantB.headers,
          })
        ).rejects.toMatchObject({ response: { status: 404 } })
        await expect(
          api.post(capturePath(merchantB.path), {}, {
            headers: merchantB.headers,
          })
        ).rejects.toMatchObject({ response: { status: 404 } })
        expect((await paymentState()).captured_at).toBeNull()

        // The owner marks it as paid: the whole amount is captured.
        const captured = await api.post(capturePath(merchantA.path), {}, {
          headers: merchantA.headers,
        })
        expect(captured.status).toBe(200)
        const state = await paymentState()
        expect(state.captured_at).not.toBeNull()
        expect(state.captures.map(({ amount }) => Number(amount))).toEqual([
          6600,
        ])

        // The home page and the assistant stop counting it.
        const placed = await listedOrder()
        expect(placed.payment_status).toBe("captured")

        // Doing it twice is refused rather than capturing again.
        await expect(
          api.post(capturePath(merchantA.path), {}, {
            headers: merchantA.headers,
          })
        ).rejects.toMatchObject({
          response: {
            status: 400,
            data: { message: "This payment is already marked as paid" },
          },
        })
        expect((await paymentState()).captures).toHaveLength(1)

        // The activity log names the order by its number.
        const activity = await api.get(`${merchantA.path}/activity`, {
          headers: merchantA.headers,
        })
        expect(JSON.stringify(activity.data)).toContain(
          `Marked order #${placed.display_id} as paid`
        )
      })
    })
  },
})
