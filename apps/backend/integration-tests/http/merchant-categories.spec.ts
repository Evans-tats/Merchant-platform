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
  moduleName: "merchant-categories-http",
  cwd: process.cwd(),
  testSuite: ({ api, getContainer }) => {
    describe("merchant categories", () => {
      it("manages a category tree per merchant with tenant, role, and handle rules", async () => {
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
              auth_identity_id: `categories-auth-${key}`,
              app_metadata: {},
              user_metadata: {},
            },
            { secret: process.env.JWT_SECRET!, expiresIn: "1h" }
          )

          return { headers: { Authorization: `Bearer ${token}` } }
        }
        const provision = async (key: string) => {
          const owner = await userService.createUsers({
            email: `categories-owner-${key}@example.test`,
          })
          const { result } = await provisionMerchantWorkflow(container).run({
            input: {
              name: `Categories Merchant ${key}`,
              slug: `categories-merchant-${key}`,
              platform_hostname: `categories-${key}.shop.localhost`,
              owner_actor_id: owner.id,
            },
          })

          return {
            ...result,
            auth: await authHeaders(owner.id, key),
            categories: `/admin/merchants/${result.merchant.id}/categories`,
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
        const create = async (
          merchant: Awaited<ReturnType<typeof provision>>,
          category: Record<string, unknown>
        ) => {
          const response = await api.post(
            merchant.categories,
            { product_categories: [category] },
            merchant.auth
          )

          return response.data.product_categories[0]
        }

        const merchantA = await provision("a")
        const merchantB = await provision("b")

        // A blank handle comes from the name; status and visibility are kept.
        const women = await create(merchantA, {
          name: "Women",
          is_active: true,
          is_internal: false,
        })
        const dresses = await create(merchantA, {
          name: "Dresses",
          is_active: false,
          is_internal: true,
          parent_category_id: women.id,
        })

        expect(women.handle).toBe("women")
        expect(dresses).toMatchObject({
          handle: "dresses",
          is_active: false,
          is_internal: true,
          parent_category_id: women.id,
        })

        // Another store asking for the same handle gets the next free one.
        const otherWomen = await create(merchantB, {
          name: "Women",
          handle: "women",
        })

        expect(otherWomen.handle).toBe("women-2")

        await expect(
          api.post(
            merchantA.categories,
            { product_categories: [{ name: "Again", handle: "women" }] },
            merchantA.auth
          )
        ).rejects.toMatchObject({
          response: {
            status: 400,
            data: {
              message: expect.stringContaining(
                'You already have a category with the handle "women"'
              ),
            },
          },
        })
        // Another store's category can't be used as a parent.
        await expect(
          api.post(
            merchantA.categories,
            {
              product_categories: [
                { name: "Sneaky", parent_category_id: otherWomen.id },
              ],
            },
            merchantA.auth
          )
        ).rejects.toMatchObject({ response: { status: 404 } })

        const listA = await api.get(merchantA.categories, merchantA.auth)

        expect(
          listA.data.product_categories.map(
            ({ id, depth }: { id: string; depth: number }) => [id, depth]
          )
        ).toEqual([
          [women.id, 0],
          [dresses.id, 1],
        ])

        const womenPath = `${merchantA.categories}/${women.id}`
        const dressesPath = `${merchantA.categories}/${dresses.id}`
        const womenDetail = await api.get(womenPath, merchantA.auth)
        const dressesDetail = await api.get(dressesPath, merchantA.auth)

        expect(womenDetail.data.product_category.category_children).toEqual([
          { id: dresses.id, name: "Dresses", handle: "dresses" },
        ])
        expect(dressesDetail.data.product_category.path).toEqual([
          { id: women.id, name: "Women" },
        ])

        // Another store can't see or change the category.
        const asMerchantB = `${merchantB.categories}/${women.id}`

        await expect(api.get(asMerchantB, merchantB.auth)).rejects.toMatchObject(
          { response: { status: 404 } }
        )
        await expect(
          api.post(asMerchantB, { name: "Taken" }, merchantB.auth)
        ).rejects.toMatchObject({ response: { status: 404 } })
        await expect(
          api.post(`${asMerchantB}/products`, { remove: ["prod_any"] }, merchantB.auth)
        ).rejects.toMatchObject({ response: { status: 404 } })
        await expect(
          api.delete(asMerchantB, merchantB.auth)
        ).rejects.toMatchObject({ response: { status: 404 } })

        // A category can't move inside itself or its own subcategories.
        await expect(
          api.post(womenPath, { parent_category_id: dresses.id }, merchantA.auth)
        ).rejects.toMatchObject({
          response: {
            status: 400,
            data: { message: expect.stringContaining("can't be moved under") },
          },
        })
        await expect(
          api.post(womenPath, { parent_category_id: women.id }, merchantA.auth)
        ).rejects.toMatchObject({ response: { status: 400 } })

        const moved = await api.post(
          dressesPath,
          { parent_category_id: null, is_active: true, is_internal: false },
          merchantA.auth
        )

        expect(moved.data.product_category).toMatchObject({
          parent_category_id: null,
          is_active: true,
          is_internal: false,
          path: [],
        })

        const movedBack = await api.post(
          dressesPath,
          { parent_category_id: women.id, name: "Summer Dresses" },
          merchantA.auth
        )

        // Renaming keeps the handle.
        expect(movedBack.data.product_category).toMatchObject({
          name: "Summer Dresses",
          handle: "dresses",
          parent_category_id: women.id,
        })

        // Products: a product can be in several categories.
        const kitenge = await createProduct(merchantA, "Kitenge Dress")
        const ankara = await createProduct(merchantA, "Ankara Top")
        const otherShirt = await createProduct(merchantB, "Other Shirt")

        await api.post(
          `${womenPath}/products`,
          { add: [kitenge.id, ankara.id] },
          merchantA.auth
        )

        const inDresses = await api.post(
          `${dressesPath}/products`,
          { add: [kitenge.id] },
          merchantA.auth
        )

        expect(inDresses.data.product_category.product_count).toBe(1)
        await expect(
          api.post(`${dressesPath}/products`, { add: [otherShirt.id] }, merchantA.auth)
        ).rejects.toMatchObject({ response: { status: 404 } })

        const removed = await api.post(
          `${womenPath}/products`,
          { remove: [ankara.id] },
          merchantA.auth
        )

        expect(
          removed.data.product_category.products.map(({ id }: { id: string }) => id)
        ).toEqual([kitenge.id])

        // Staff can view categories but not change them.
        const staff = await userService.createUsers({
          email: "categories-staff@example.test",
        })

        await merchantService.createMerchantMembers({
          merchant_id: merchantA.merchant.id,
          actor_id: staff.id,
          role: "staff",
          status: "active",
        })

        const staffAuth = await authHeaders(staff.id, "staff")

        expect((await api.get(womenPath, staffAuth)).status).toBe(200)
        await expect(
          api.post(womenPath, { name: "Nope" }, staffAuth)
        ).rejects.toMatchObject({ response: { status: 403 } })
        await expect(
          api.post(merchantA.categories, { product_categories: [{ name: "Nope" }] }, staffAuth)
        ).rejects.toMatchObject({ response: { status: 403 } })
        await expect(api.delete(dressesPath, staffAuth)).rejects.toMatchObject({
          response: { status: 403 },
        })

        // A category with subcategories can't be deleted until they're gone.
        await expect(api.delete(womenPath, merchantA.auth)).rejects.toMatchObject({
          response: {
            status: 400,
            data: { message: expect.stringContaining("has subcategories") },
          },
        })

        const deleted = await api.delete(dressesPath, merchantA.auth)

        expect(deleted.data).toEqual({
          id: dresses.id,
          object: "product_category",
          deleted: true,
        })

        const { data: products } = await query.graph({
          entity: "product",
          fields: ["id", "categories.id"],
          filters: { id: kitenge.id },
        })

        expect(
          (products[0].categories ?? []).map((category) => category?.id)
        ).toEqual([women.id])
        await expect(api.get(dressesPath, merchantA.auth)).rejects.toMatchObject(
          { response: { status: 404 } }
        )
        expect((await api.delete(womenPath, merchantA.auth)).status).toBe(200)

        // A deleted category's handle can be used again.
        const newWomen = await create(merchantA, { name: "Women" })

        expect(newWomen.handle).toBe("women")

        // Edit ranking: both stores' top-level categories share Medusa's
        // ranking, so positions are kept per store.
        const shoes = await create(merchantA, { name: "Shoes" })
        await create(merchantB, { name: "Belts" })
        const bags = await create(merchantA, { name: "Bags" })
        await create(merchantB, { name: "Scarves" })
        const hats = await create(merchantA, { name: "Hats" })
        const order = async (merchant: typeof merchantA) =>
          (await api.get(merchant.categories, merchant.auth)).data
            .product_categories.map(
              ({ name, depth }: { name: string; depth: number }) =>
                `${"  ".repeat(depth)}${name}`
            )
        const move = (
          id: string,
          rank: number,
          parentCategoryId: string | null = null
        ) =>
          api.post(
            `${merchantA.categories}/${id}`,
            { rank, parent_category_id: parentCategoryId },
            merchantA.auth
          )

        expect(await order(merchantA)).toEqual(["Women", "Shoes", "Bags", "Hats"])

        await move(hats.id, 0)
        expect(await order(merchantA)).toEqual(["Hats", "Women", "Shoes", "Bags"])

        await move(hats.id, 3)
        expect(await order(merchantA)).toEqual(["Women", "Shoes", "Bags", "Hats"])

        await move(newWomen.id, 1)
        expect(await order(merchantA)).toEqual(["Shoes", "Women", "Bags", "Hats"])

        // Dragging sideways nests a category, or moves it back out.
        await move(bags.id, 0, shoes.id)
        expect(await order(merchantA)).toEqual(["Shoes", "  Bags", "Women", "Hats"])

        await move(bags.id, 0)
        expect(await order(merchantA)).toEqual(["Bags", "Shoes", "Women", "Hats"])

        // The other store's order is untouched.
        expect(await order(merchantB)).toEqual(["Women", "Belts", "Scarves"])
      })
    })
  },
})
