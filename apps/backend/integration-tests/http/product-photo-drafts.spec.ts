const generateContent = jest.fn()

// The real Gemini API is never called in tests.
jest.mock("@google/genai", () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: { generateContent },
  })),
  ThinkingLevel: { LOW: "LOW" },
}))

import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  ContainerRegistrationKeys,
  generateJwtToken,
  Modules,
} from "@medusajs/framework/utils"
import MerchantModuleService from "../../src/modules/merchant/service"
import { MERCHANT_MODULE } from "../../src/modules/merchant"
import { provisionMerchantWorkflow } from "../../src/workflows/provision-merchant"
import { createMerchantCategoriesWorkflow } from "../../src/workflows/merchant-categories"
import {
  createMerchantAFixture,
  createMerchantBFixture,
} from "../helpers/merchant-fixtures"

jest.setTimeout(180000)

const createPhotoForm = (type = "image/jpeg", count = 1) => {
  const form = new FormData()
  for (let index = 1; index <= count; index += 1) {
    form.append(
      "photos",
      new Blob([`product photo ${index}`], { type }),
      `sneaker-${index}.jpg`
    )
  }

  return form
}

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

const draftResponse = (category: string | null) => ({
  text: JSON.stringify({
    photo_usable: true,
    retake_advice: null,
    title: "Lace-Up Sneakers with White Sole",
    description: "Low-top sneakers with a white sole, in black and brown.",
    category,
    options: [{ title: "Colour", values: ["Black", "Brown"] }],
    visible_brand: null,
    confidence: "high",
    notes_for_merchant: "Add the available sizes.",
    mixed_products: false,
    photos: [
      { index: 1, option_values: [{ option: "Colour", value: "Black" }] },
      { index: 2, option_values: [{ option: "Colour", value: "Brown" }] },
    ],
  }),
  usageMetadata: {
    promptTokenCount: 1400,
    candidatesTokenCount: 150,
    thoughtsTokenCount: 0,
  },
})

medusaIntegrationTestRunner({
  moduleName: "merchant-platform-photo-drafts",
  cwd: process.cwd(),
  testSuite: ({ api, getContainer }) => {
    describe("product drafts from photos", () => {
      const originalKey = process.env.GEMINI_API_KEY

      beforeEach(() => {
        generateContent.mockReset()
        process.env.GEMINI_API_KEY = "test-key"
      })

      afterAll(() => {
        process.env.GEMINI_API_KEY = originalKey
      })

      it("drafts listing details for catalog managers only", async () => {
        const container = getContainer()
        const userService = container.resolve(Modules.USER)
        const merchantService =
          container.resolve<MerchantModuleService>(MERCHANT_MODULE)
        const fixtureA = createMerchantAFixture()
        const fixtureB = createMerchantBFixture()
        const ownerA = await userService.createUsers({
          email: fixtureA.owner.email,
        })
        const ownerB = await userService.createUsers({
          email: fixtureB.owner.email,
        })
        const { result: merchantA } = await provisionMerchantWorkflow(
          container
        ).run({
          input: {
            name: fixtureA.merchant.name,
            slug: fixtureA.merchant.slug,
            platform_hostname: fixtureA.domain.hostname,
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
          },
        })
        const { result: categories } = await createMerchantCategoriesWorkflow(
          container
        ).run({
          input: {
            merchant_id: merchantA.merchant.id,
            sales_channel_id: merchantA.salesChannel.id,
            product_categories: [
              { name: "Shoes", is_active: true },
              { name: "Beauty", is_active: true },
            ],
          },
        })
        const shoesCategory = categories.find(({ name }) => name === "Shoes")!
        const staffUser = await userService.createUsers({
          email: "photo-draft-staff@test.local",
        })
        await merchantService.createMerchantMembers({
          merchant_id: merchantA.merchant.id,
          actor_id: staffUser.id,
          role: "staff",
          status: "active",
        })
        const ownerHeaders = {
          Authorization: `Bearer ${await tokenFor(ownerA.id, "photo-draft-owner")}`,
        }
        const staffHeaders = {
          Authorization: `Bearer ${await tokenFor(staffUser.id, "photo-draft-staff")}`,
        }
        const draftsUrl = `/admin/merchants/${merchantA.merchant.id}/product-drafts`

        const status = await api.get(draftsUrl, { headers: ownerHeaders })
        expect(status.data).toEqual({ enabled: true })

        generateContent.mockResolvedValueOnce(draftResponse("Shoes"))
        const drafted = await api.post(
          draftsUrl,
          createPhotoForm("image/jpeg", 2),
          { headers: ownerHeaders }
        )

        expect(drafted.status).toBe(200)
        expect(drafted.data.draft).toMatchObject({
          photo_usable: true,
          mixed_products: false,
          title: "Lace-Up Sneakers with White Sole",
          category_id: shoesCategory.id,
          options: [{ title: "Colour", values: ["Black", "Brown"] }],
          photos: [
            { index: 1, option_values: [{ option: "Colour", value: "Black" }] },
            { index: 2, option_values: [{ option: "Colour", value: "Brown" }] },
          ],
        })
        expect(drafted.data.draft).not.toHaveProperty("category")
        const request = generateContent.mock.calls[0][0]
        const parts = request.contents[0].parts
        expect(parts.filter((part: object) => "inlineData" in part)).toHaveLength(2)
        expect(parts[2].text).toContain("Shoes")
        expect(parts[2].text).toContain("Beauty")
        await expect(
          api.post(draftsUrl, createPhotoForm("image/jpeg", 6), {
            headers: ownerHeaders,
          })
        ).rejects.toMatchObject({
          response: {
            status: 400,
            data: { message: "Send up to 5 photos for one draft" },
          },
        })

        await expect(
          api.post(draftsUrl, createPhotoForm(), { headers: staffHeaders })
        ).rejects.toMatchObject({ response: { status: 403 } })
        await expect(
          api.post(
            `/admin/merchants/${merchantB.merchant.id}/product-drafts`,
            createPhotoForm(),
            { headers: ownerHeaders }
          )
        ).rejects.toMatchObject({ response: { status: 404 } })
        await expect(
          api.post(draftsUrl, new FormData(), { headers: ownerHeaders })
        ).rejects.toMatchObject({ response: { status: 400 } })
        await expect(
          api.post(draftsUrl, createPhotoForm("text/plain"), {
            headers: ownerHeaders,
          })
        ).rejects.toMatchObject({ response: { status: 400 } })
        expect(generateContent).toHaveBeenCalledTimes(1)

        // A model outage is reported in plain words, not as a server error.
        generateContent.mockRejectedValue(
          Object.assign(new Error("Unexpected"), { status: 400 })
        )
        await expect(
          api.post(draftsUrl, createPhotoForm(), { headers: ownerHeaders })
        ).rejects.toMatchObject({
          response: {
            status: 400,
            data: {
              message: expect.stringContaining("fill in the details yourself"),
            },
          },
        })

        delete process.env.GEMINI_API_KEY
        const disabled = await api.get(draftsUrl, { headers: ownerHeaders })
        expect(disabled.data).toEqual({ enabled: false })
      })

      it("shows each colour's own photo by linking photos to variants", async () => {
        const container = getContainer()
        const query = container.resolve(ContainerRegistrationKeys.QUERY)
        const userService = container.resolve(Modules.USER)
        const fixture = createMerchantAFixture({
          merchant: { slug: "variant-photos" },
          domain: { hostname: "variant-photos.shop.localhost" },
          owner: { email: "variant-photos-owner@test.local" },
        })
        const owner = await userService.createUsers({
          email: fixture.owner.email,
        })
        const { result: merchant } = await provisionMerchantWorkflow(
          container
        ).run({
          input: {
            name: fixture.merchant.name,
            slug: fixture.merchant.slug,
            platform_hostname: fixture.domain.hostname,
            owner_actor_id: owner.id,
          },
        })
        const headers = {
          Authorization: `Bearer ${await tokenFor(owner.id, "variant-photos-owner")}`,
        }
        const blackUrl = "https://cdn.test.local/sneaker-black.jpg"
        const brownUrl = "https://cdn.test.local/sneaker-brown.jpg"
        const sneakers = (variantImages: Record<string, string[]>) => ({
          products: [{
            title: "Lace-Up Sneakers with White Sole",
            handle: `lace-up-sneakers-${Object.keys(variantImages).length}-${Date.now()}`,
            status: "draft",
            thumbnail: blackUrl,
            images: [{ url: blackUrl }, { url: brownUrl }],
            options: [{ title: "Colour", values: ["Black", "Brown"] }],
            variants: ["Black", "Brown"].map((colour) => ({
              title: colour,
              options: { Colour: colour },
              ...(variantImages[colour] && { image_urls: variantImages[colour] }),
            })),
          }],
        })

        const created = await api.post(
          `/admin/merchants/${merchant.merchant.id}/products`,
          sneakers({ Black: [blackUrl], Brown: [brownUrl] }),
          { headers }
        )

        expect(created.status).toBe(201)
        const { data: variants } = await query.graph({
          entity: "product_variant",
          fields: ["title", "images.url"],
          filters: { product_id: created.data.products[0].id },
        })
        const imagesByVariant = Object.fromEntries(
          (variants as unknown as Array<{ title: string; images: Array<{ url: string }> }>)
            .map(({ title, images }) => [title, images.map(({ url }) => url)])
        )
        expect(imagesByVariant).toEqual({
          Black: [blackUrl],
          Brown: [brownUrl],
        })

        await expect(
          api.post(
            `/admin/merchants/${merchant.merchant.id}/products`,
            sneakers({ Brown: ["https://elsewhere.test.local/other.jpg"] }),
            { headers }
          )
        ).rejects.toMatchObject({
          response: {
            status: 400,
            data: { message: expect.stringContaining("must be images of the product") },
          },
        })
      })
    })
  },
})
