import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  ContainerRegistrationKeys,
  generateJwtToken,
  Modules,
} from "@medusajs/framework/utils"

import { MERCHANT_MODULE } from "../../src/modules/merchant"
import MerchantModuleService from "../../src/modules/merchant/service"
import { createMerchantProductsWorkflow } from "../../src/workflows/merchant-catalog"
import { provisionMerchantWorkflow } from "../../src/workflows/provision-merchant"

jest.setTimeout(180000)

medusaIntegrationTestRunner({
  moduleName: "merchant-collections-http",
  cwd: process.cwd(),
  testSuite: ({ api, getContainer }) => {
    describe("merchant collections", () => {
      it("manages collections per merchant with tenant, role, and handle rules", async () => {
        const container = getContainer()
        const query = container.resolve(ContainerRegistrationKeys.QUERY)
        const userService = container.resolve(Modules.USER)
        const merchantService =
          container.resolve<MerchantModuleService>(MERCHANT_MODULE)

        const authHeaders = async (actorId: string, key: string) => {
          const token = await generateJwtToken(
            {
              actor_id: actorId,
              actor_type: "user",
              auth_identity_id: `collections-auth-${key}`,
              app_metadata: {},
              user_metadata: {},
            },
            { secret: process.env.JWT_SECRET!, expiresIn: "1h" }
          )

          return { headers: { Authorization: `Bearer ${token}` } }
        }
        const provision = async (key: string) => {
          const owner = await userService.createUsers({
            email: `collections-owner-${key}@example.test`,
          })
          const { result } = await provisionMerchantWorkflow(container).run({
            input: {
              name: `Collections Merchant ${key}`,
              slug: `collections-merchant-${key}`,
              platform_hostname: `collections-${key}.shop.localhost`,
              owner_actor_id: owner.id,
            },
          })

          return {
            ...result,
            auth: await authHeaders(owner.id, key),
            collections: `/admin/merchants/${result.merchant.id}/collections`,
          }
        }
        const createProduct = async (
          merchant: Awaited<ReturnType<typeof provision>>,
          title: string
        ) => {
          const { result } = await createMerchantProductsWorkflow(
            container
          ).run({
            input: {
              merchant_id: merchant.merchant.id,
              sales_channel_id: merchant.salesChannel.id,
              products: [
                {
                  title,
                  status: "draft",
                  options: [{ title: "Default", values: ["Default"] }],
                  variants: [
                    {
                      title: "Default",
                      manage_inventory: false,
                      options: { Default: "Default" },
                    },
                  ],
                },
              ],
            },
          })

          return result[0]
        }

        const merchantA = await provision("a")
        const merchantB = await provision("b")

        // A blank handle comes from the title.
        const createdA = await api.post(
          merchantA.collections,
          { collections: [{ title: "Summer Edit" }] },
          merchantA.auth
        )
        const collectionA = createdA.data.collections[0]

        expect(createdA.status).toBe(201)
        expect(collectionA.handle).toBe("summer-edit")

        // Another store asking for the same handle gets the next free one.
        const createdB = await api.post(
          merchantB.collections,
          { collections: [{ title: "Summer Edit", handle: "summer-edit" }] },
          merchantB.auth
        )

        expect(createdB.data.collections[0].handle).toBe("summer-edit-2")

        // Reusing your own handle is an error the merchant can fix.
        await expect(
          api.post(
            merchantA.collections,
            { collections: [{ title: "Again", handle: "summer-edit" }] },
            merchantA.auth
          )
        ).rejects.toMatchObject({
          response: {
            status: 400,
            data: {
              message: expect.stringContaining(
                'You already have a collection with the handle "summer-edit"'
              ),
            },
          },
        })
        await expect(
          api.post(
            merchantA.collections,
            { collections: [{ title: "Bad", handle: "Bad Handle" }] },
            merchantA.auth
          )
        ).rejects.toMatchObject({ response: { status: 400 } })
        await expect(
          api.post(
            merchantA.collections,
            { collections: [{ handle: "no-title" }] },
            merchantA.auth
          )
        ).rejects.toMatchObject({ response: { status: 400 } })

        const listA = await api.get(merchantA.collections, merchantA.auth)

        expect(listA.data).toMatchObject({
          count: 1,
          collections: [
            { id: collectionA.id, handle: "summer-edit", product_count: 0 },
          ],
        })

        // Another store can't see or change the collection.
        const collectionAPath = `${merchantA.collections}/${collectionA.id}`
        const asMerchantB = `${merchantB.collections}/${collectionA.id}`

        await expect(api.get(asMerchantB, merchantB.auth)).rejects.toMatchObject(
          { response: { status: 404 } }
        )
        await expect(
          api.post(asMerchantB, { title: "Taken" }, merchantB.auth)
        ).rejects.toMatchObject({ response: { status: 404 } })
        await expect(
          api.post(
            `${asMerchantB}/products`,
            { remove: ["prod_any"] },
            merchantB.auth
          )
        ).rejects.toMatchObject({ response: { status: 404 } })
        await expect(
          api.delete(asMerchantB, merchantB.auth)
        ).rejects.toMatchObject({ response: { status: 404 } })

        const dress = await createProduct(merchantA, "Kitenge Dress")
        const top = await createProduct(merchantA, "Ankara Top")
        const otherStoreShirt = await createProduct(merchantB, "Other Shirt")

        const added = await api.post(
          `${collectionAPath}/products`,
          { add: [dress.id, top.id] },
          merchantA.auth
        )

        expect(added.data.collection.product_count).toBe(2)
        expect(
          added.data.collection.products.map(
            ({ title }: { title: string }) => title
          )
        ).toEqual(["Ankara Top", "Kitenge Dress"])
        await expect(
          api.post(
            `${collectionAPath}/products`,
            { add: [otherStoreShirt.id] },
            merchantA.auth
          )
        ).rejects.toMatchObject({ response: { status: 404 } })

        const removed = await api.post(
          `${collectionAPath}/products`,
          { remove: [top.id] },
          merchantA.auth
        )

        expect(
          removed.data.collection.products.map(({ id }: { id: string }) => id)
        ).toEqual([dress.id])

        // Renaming keeps the handle; a new handle goes through the same rules.
        const renamed = await api.post(
          collectionAPath,
          { title: "Summer Picks" },
          merchantA.auth
        )

        expect(renamed.data.collection).toMatchObject({
          title: "Summer Picks",
          handle: "summer-edit",
        })

        const rehandled = await api.post(
          collectionAPath,
          { handle: "summer-edit-2" },
          merchantA.auth
        )

        // Another store holds summer-edit-2, so a number is appended to it.
        expect(rehandled.data.collection.handle).toBe("summer-edit-2-2")

        // Staff can view collections but not change them.
        const staff = await userService.createUsers({
          email: "collections-staff@example.test",
        })

        await merchantService.createMerchantMembers({
          merchant_id: merchantA.merchant.id,
          actor_id: staff.id,
          role: "staff",
          status: "active",
        })

        const staffAuth = await authHeaders(staff.id, "staff")
        const staffView = await api.get(collectionAPath, staffAuth)

        expect(staffView.data.collection.id).toBe(collectionA.id)
        await expect(
          api.post(collectionAPath, { title: "Nope" }, staffAuth)
        ).rejects.toMatchObject({ response: { status: 403 } })
        await expect(
          api.post(merchantA.collections, { collections: [{ title: "Nope" }] }, staffAuth)
        ).rejects.toMatchObject({ response: { status: 403 } })
        await expect(
          api.delete(collectionAPath, staffAuth)
        ).rejects.toMatchObject({ response: { status: 403 } })

        // Deleting detaches products so none point at a deleted collection.
        const deleted = await api.delete(collectionAPath, merchantA.auth)

        expect(deleted.data).toEqual({
          id: collectionA.id,
          object: "collection",
          deleted: true,
        })

        const { data: products } = await query.graph({
          entity: "product",
          fields: ["id", "collection_id"],
          filters: { id: dress.id },
        })

        expect(products[0].collection_id).toBeNull()
        await expect(
          api.get(collectionAPath, merchantA.auth)
        ).rejects.toMatchObject({ response: { status: 404 } })

        // The deleted collection's handle can be used again.
        const recreated = await api.post(
          merchantA.collections,
          { collections: [{ title: "Summer Again", handle: "summer-edit-2-2" }] },
          merchantA.auth
        )

        expect(recreated.data.collections[0].handle).toBe("summer-edit-2-2")
        expect(
          (await api.get(merchantA.collections, merchantA.auth)).data.count
        ).toBe(1)
      })
    })
  },
})
