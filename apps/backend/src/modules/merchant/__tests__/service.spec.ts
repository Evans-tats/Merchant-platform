import { moduleIntegrationTestRunner } from "@medusajs/test-utils"

import {
  createMerchantAFixture,
  createMerchantBFixture,
} from "../../../../integration-tests/helpers/merchant-fixtures"
import { MERCHANT_MODULE } from ".."
import MerchantModuleService from "../service"

moduleIntegrationTestRunner<MerchantModuleService>({
  moduleName: MERCHANT_MODULE,
  resolve: "./src/modules/merchant",
  testSuite: ({ service }) => {
    describe("MerchantModuleService", () => {
      it("keeps a shared shopper's profiles scoped to their merchants", async () => {
        const fixtureA = createMerchantAFixture()
        const fixtureB = createMerchantBFixture()
        const merchantA = await service.createMerchants(fixtureA.merchant)
        const merchantB = await service.createMerchants(fixtureB.merchant)

        await service.createMerchantDomains({
          merchant_id: merchantA.id,
          hostname: fixtureA.domain.hostname,
          is_primary: fixtureA.domain.isPrimary,
          status: fixtureA.domain.status,
          type: fixtureA.domain.type,
        })
        await service.createMerchantDomains({
          merchant_id: merchantB.id,
          hostname: fixtureB.domain.hostname,
          is_primary: fixtureB.domain.isPrimary,
          status: fixtureB.domain.status,
          type: fixtureB.domain.type,
        })

        const customerA = await service.createMerchantCustomerProfiles({
          merchant_id: merchantA.id,
          customer_id: fixtureA.shopper.email,
          profile: { first_name: fixtureA.shopper.firstName },
        })
        const customerB = await service.createMerchantCustomerProfiles({
          merchant_id: merchantB.id,
          customer_id: fixtureB.shopper.email,
          profile: { first_name: fixtureB.shopper.firstName },
        })

        const merchantAProfiles =
          await service.listMerchantCustomerProfiles({
            merchant_id: merchantA.id,
          })
        const merchantBProfiles =
          await service.listMerchantCustomerProfiles({
            merchant_id: merchantB.id,
          })

        expect(customerA.customer_id).toBe(customerB.customer_id)
        expect(merchantAProfiles).toHaveLength(1)
        expect(merchantAProfiles[0].id).toBe(customerA.id)
        expect(merchantBProfiles).toHaveLength(1)
        expect(merchantBProfiles[0].id).toBe(customerB.id)
      })

      it("enforces tenant identity and primary-record constraints", async () => {
        const fixture = createMerchantAFixture()
        const merchant = await service.createMerchants(fixture.merchant)

        await service.createMerchantDomains({
          merchant_id: merchant.id,
          hostname: fixture.domain.hostname,
          is_primary: true,
          status: fixture.domain.status,
          type: fixture.domain.type,
        })

        await expect(
          service.createMerchantDomains({
            merchant_id: merchant.id,
            hostname: "second-primary.shop.localhost",
            is_primary: true,
            status: "active",
            type: "platform",
          })
        ).rejects.toThrow()

        await expect(
          service.createMerchants({
            ...fixture.merchant,
            name: "Duplicate slug",
          })
        ).rejects.toThrow()
      })

      it("persists only an external reference for payment secrets", async () => {
        const fixture = createMerchantAFixture()
        const merchant = await service.createMerchants(fixture.merchant)
        const paymentConfig =
          await service.createMerchantPaymentConfigs({
            merchant_id: merchant.id,
            provider: "mpesa_stk",
            mode: "sandbox",
            status: "active",
            public_configuration: {
              shortcode: "174379",
            },
            secret_reference: "vault://merchants/merchant-a/mpesa-stk",
          })

        expect(paymentConfig.public_configuration).toEqual({
          shortcode: "174379",
        })
        expect(paymentConfig.secret_reference).toBe(
          "vault://merchants/merchant-a/mpesa-stk"
        )
        expect(paymentConfig).not.toHaveProperty("consumer_secret")
        expect(paymentConfig).not.toHaveProperty("passkey")
      })

      it("keeps activity and notifications isolated by merchant", async () => {
        const merchantA = await service.createMerchants(
          createMerchantAFixture().merchant
        )
        const merchantB = await service.createMerchants(
          createMerchantBFixture().merchant
        )
        const activityA = await service.createMerchantActivities({
          merchant_id: merchantA.id,
          actor_id: "user_a",
          action: "product.updated",
          resource_type: "product",
          resource_id: "prod_a",
          description: "Updated Merchant A product",
          metadata: {},
        })
        const notificationB = await service.createMerchantNotifications({
          merchant_id: merchantB.id,
          type: "inventory.low_stock",
          severity: "warning",
          title: "Low stock",
          message: "Merchant B inventory is low",
          resource_type: "inventory_item",
          resource_id: "iitem_b",
          metadata: {},
        })

        const [activitiesA, activitiesB, notificationsA, notificationsB] =
          await Promise.all([
            service.listMerchantActivities({ merchant_id: merchantA.id }),
            service.listMerchantActivities({ merchant_id: merchantB.id }),
            service.listMerchantNotifications({ merchant_id: merchantA.id }),
            service.listMerchantNotifications({ merchant_id: merchantB.id }),
          ])

        expect(activitiesA.map(({ id }) => id)).toEqual([activityA.id])
        expect(activitiesB).toEqual([])
        expect(notificationsA).toEqual([])
        expect(notificationsB.map(({ id }) => id)).toEqual([
          notificationB.id,
        ])
      })
    })
  },
})
