const generateContentStream = jest.fn()

// The real Gemini API is never called in tests.
jest.mock("@google/genai", () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: { generateContentStream },
  })),
}))

import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import {
  ContainerRegistrationKeys,
  generateJwtToken,
  Modules,
} from "@medusajs/framework/utils"
import { createOrderWorkflow } from "@medusajs/medusa/core-flows"

import { MERCHANT_MODULE } from "../../src/modules/merchant"
import type MerchantModuleService from "../../src/modules/merchant/service"
import { createMerchantProductsWorkflow } from "../../src/workflows/merchant-catalog"
import { createMerchantCollectionsWorkflow } from "../../src/workflows/merchant-collections"
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

async function* streamOf(...parts: object[]) {
  for (const part of parts) {
    yield { candidates: [{ content: { parts: [part] } }] }
  }
}

const parseLines = (body: string) =>
  body
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line))

// The assistant can suggest a change but never make one: only the member's
// own approval, through the merchant route, changes the store.
medusaIntegrationTestRunner({
  moduleName: "merchant-platform-assistant-proposals",
  cwd: process.cwd(),
  testSuite: ({ api, getContainer }) => {
    describe("store assistant suggestions", () => {
      const originalKey = process.env.GEMINI_API_KEY

      beforeEach(() => {
        generateContentStream.mockReset()
        process.env.GEMINI_API_KEY = "test-key"
      })

      afterAll(() => {
        process.env.GEMINI_API_KEY = originalKey
      })

      it("suggests an order note that only the member's approval applies", async () => {
        const container = getContainer()
        const link = container.resolve(ContainerRegistrationKeys.LINK)
        const query = container.resolve(ContainerRegistrationKeys.QUERY)
        const userService = container.resolve(Modules.USER)
        const regionService = container.resolve(Modules.REGION)
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
        const staffA = await userService.createUsers({
          email: "proposal-staff@test.local",
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
        await merchantService.createMerchantMembers({
          merchant_id: merchantA.merchant.id,
          actor_id: staffA.id,
          role: "staff",
          status: "active",
        })
        const region = await regionService.createRegions({
          name: "Proposals region",
          currency_code: "kes",
          automatic_taxes: false,
          countries: ["ke"],
        })
        const { result: createdOrder } = await createOrderWorkflow(
          container
        ).run({
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
                unit_price: 1100,
                product_title: "Kikoi",
              },
            ],
          },
        })
        await link.create({
          [MERCHANT_MODULE]: { merchant_id: merchantA.merchant.id },
          [Modules.ORDER]: { order_id: createdOrder.id },
        })
        const {
          data: [order],
        } = (await query.graph({
          entity: "order",
          fields: ["id", "display_id"],
          filters: { id: createdOrder.id },
        })) as unknown as { data: Array<{ id: string; display_id: number }> }
        const notesOf = async () => {
          const { data } = await query.graph({
            entity: "order",
            fields: ["metadata"],
            filters: { id: order.id },
          })
          const metadata = (data[0] as { metadata?: Record<string, unknown> })
            .metadata
          return (metadata?.merchant_notes ?? []) as Array<{ note: string }>
        }

        const ownerAHeaders = {
          Authorization: `Bearer ${await tokenFor(ownerA.id, "proposal-owner-a")}`,
        }
        const ownerBHeaders = {
          Authorization: `Bearer ${await tokenFor(ownerB.id, "proposal-owner-b")}`,
        }
        const staffAHeaders = {
          Authorization: `Bearer ${await tokenFor(staffA.id, "proposal-staff-a")}`,
        }
        const merchantAPath = `/admin/merchants/${merchantA.merchant.id}`
        const assistantA = `${merchantAPath}/assistant`
        const assistantB = `/admin/merchants/${merchantB.merchant.id}/assistant`
        const reply = `I've suggested a note on order #${order.display_id}. It's waiting for your approval.`

        // The model suggests a note, then says it's waiting for approval.
        generateContentStream
          .mockResolvedValueOnce(
            streamOf({
              functionCall: {
                id: "call_1",
                name: "propose_order_note",
                args: {
                  order_number: order.display_id,
                  note: "Customer asked for gift wrapping",
                  summary: "They said it's a gift.",
                },
              },
              thoughtSignature: "sig-1",
            })
          )
          .mockResolvedValueOnce(streamOf({ text: reply }))
        const answered = await api.post(
          assistantA,
          { message: `Note on order #${order.display_id} that it's a gift` },
          { headers: ownerAHeaders, responseType: "text" }
        )

        const lines = parseLines(answered.data)
        const sessionId = lines[0].session_id
        const proposal = lines.find(({ type }) => type === "proposal")?.proposal
        expect(proposal).toEqual({
          id: expect.stringMatching(/^agprop_/),
          action: "add_order_note",
          args: { order_id: order.id, note: "Customer asked for gift wrapping" },
          preview: { order_number: order.display_id },
          summary: "They said it's a gift.",
          status: "pending",
          error: null,
        })
        expect(lines.at(-1)).toEqual({ type: "done" })

        // The model hears that nothing has changed yet, and nothing has.
        const toolAnswer =
          generateContentStream.mock.calls[1][0].contents[2].parts[0]
            .functionResponse
        expect(toolAnswer.response.result).toMatchObject({
          proposal_id: proposal.id,
          status: "waiting_for_owner",
        })
        expect(await notesOf()).toEqual([])

        // The card comes back with its reply when the chat is reopened.
        const detail = await api.get(`${assistantA}/sessions/${sessionId}`, {
          headers: ownerAHeaders,
        })
        expect(detail.data.session.messages).toEqual([
          expect.objectContaining({ role: "user", proposals: [] }),
          expect.objectContaining({
            role: "assistant",
            content: reply,
            proposals: [proposal],
          }),
        ])

        // Only the member whose chat it is can resolve it.
        const resolveA = `${assistantA}/proposals/${proposal.id}`
        await expect(
          api.post(resolveA, { status: "dismissed" }, { headers: staffAHeaders })
        ).rejects.toMatchObject({ response: { status: 404 } })
        await expect(
          api.post(
            `${assistantB}/proposals/${proposal.id}`,
            { status: "dismissed" },
            { headers: ownerBHeaders }
          )
        ).rejects.toMatchObject({ response: { status: 404 } })

        // Edits are checked against what the action lets the member change.
        await expect(
          api.post(
            resolveA,
            { status: "approved", edits: { note: "   " } },
            { headers: ownerAHeaders }
          )
        ).rejects.toMatchObject({ response: { status: 400 } })

        // Approving: the dashboard calls the notes route with the edited
        // note, then records the outcome. Only the note can be edited.
        await api.post(
          `${merchantAPath}/orders/${order.id}/notes`,
          { note: "Gift wrap in blue paper" },
          { headers: ownerAHeaders }
        )
        const approved = await api.post(
          resolveA,
          {
            status: "approved",
            edits: { note: "Gift wrap in blue paper", order_id: "order_other" },
          },
          { headers: ownerAHeaders }
        )
        expect(approved.data.proposal).toMatchObject({
          status: "approved",
          args: { order_id: order.id, note: "Gift wrap in blue paper" },
        })
        expect((await notesOf()).map(({ note }) => note)).toEqual([
          "Gift wrap in blue paper",
        ])

        // Approved is final.
        await expect(
          api.post(resolveA, { status: "dismissed" }, { headers: ownerAHeaders })
        ).rejects.toMatchObject({ response: { status: 400 } })

        // The next turn tells the model what happened to the suggestion.
        generateContentStream.mockResolvedValueOnce(streamOf({ text: "Done." }))
        await api.post(
          assistantA,
          { message: "Thanks", session_id: sessionId },
          { headers: ownerAHeaders, responseType: "text" }
        )
        expect(generateContentStream.mock.calls[2][0].contents[1]).toEqual({
          role: "model",
          parts: [
            {
              text: `${reply}\n\n[Suggestion card: add a note to order #${order.display_id} - approved by the owner and done]`,
            },
          ],
        })

        // If the model fails after suggesting, the card is still kept.
        generateContentStream
          .mockResolvedValueOnce(
            streamOf({
              functionCall: {
                id: "call_2",
                name: "propose_order_note",
                args: {
                  order_number: order.display_id,
                  note: "Paid by M-Pesa",
                  summary: "For the records.",
                },
              },
            })
          )
          .mockRejectedValue(
            Object.assign(new Error("high demand"), { status: 503 })
          )
        const failed = await api.post(
          assistantA,
          { message: "Also note they paid by M-Pesa", session_id: sessionId },
          { headers: ownerAHeaders, responseType: "text" }
        )
        expect(parseLines(failed.data).at(-1)).toMatchObject({ type: "error" })
        const reopened = await api.get(`${assistantA}/sessions/${sessionId}`, {
          headers: ownerAHeaders,
        })
        expect(reopened.data.session.messages.at(-1)).toMatchObject({
          role: "assistant",
          content: "",
          proposals: [
            expect.objectContaining({
              args: { order_id: order.id, note: "Paid by M-Pesa" },
              status: "pending",
            }),
          ],
        })
        expect(await notesOf()).toHaveLength(1)
      })

      it("suggests catalog changes that only owners and admins can approve", async () => {
        const container = getContainer()
        const query = container.resolve(ContainerRegistrationKeys.QUERY)
        const userService = container.resolve(Modules.USER)
        const regionService = container.resolve(Modules.REGION)
        const merchantService =
          container.resolve<MerchantModuleService>(MERCHANT_MODULE)
        const owner = await userService.createUsers({
          email: "catalog-owner@test.local",
        })
        const staff = await userService.createUsers({
          email: "catalog-staff@test.local",
        })
        const { result: merchant } = await provisionMerchantWorkflow(
          container
        ).run({
          input: {
            name: "Catalog Suggestions Shop",
            slug: "catalog-suggestions-shop",
            platform_hostname: "catalog-suggestions.shop.localhost",
            owner_actor_id: owner.id,
          },
        })
        await merchantService.createMerchantMembers({
          merchant_id: merchant.merchant.id,
          actor_id: staff.id,
          role: "staff",
          status: "active",
        })
        await regionService.createRegions({
          name: "Catalog region",
          currency_code: "kes",
          automatic_taxes: false,
          countries: ["ke"],
        })
        const scope = {
          merchant_id: merchant.merchant.id,
          sales_channel_id: merchant.salesChannel.id,
        }
        const { result: collections } =
          await createMerchantCollectionsWorkflow(container).run({
            input: {
              ...scope,
              collections: [{ title: "Summer" }, { title: "Bags" }],
            },
          })
        const [summer, bags] = collections
        const createProduct = async (title: string, collectionId?: string) => {
          const { result } = await createMerchantProductsWorkflow(
            container
          ).run({
            input: {
              ...scope,
              products: [
                {
                  title,
                  description: `${title}, old text.`,
                  status: "draft",
                  collection_id: collectionId,
                  options: [{ title: "Default", values: ["Default"] }],
                  variants: [
                    {
                      title: "Default",
                      manage_inventory: false,
                      options: { Default: "Default" },
                      prices: [{ amount: 1100, currency_code: "kes" }],
                    },
                  ],
                },
              ],
            },
          })
          return result[0]
        }
        const kikoi = await createProduct("Kikoi")
        const tote = await createProduct("Tote", bags.id)
        const productState = async (id: string) => {
          const { data } = await query.graph({
            entity: "product",
            fields: ["status", "description", "collection_id"],
            filters: { id },
          })
          return data[0] as {
            status: string
            description: string | null
            collection_id: string | null
          }
        }

        const ownerHeaders = {
          Authorization: `Bearer ${await tokenFor(owner.id, "catalog-owner")}`,
        }
        const staffHeaders = {
          Authorization: `Bearer ${await tokenFor(staff.id, "catalog-staff")}`,
        }
        const merchantPath = `/admin/merchants/${merchant.merchant.id}`
        const assistant = `${merchantPath}/assistant`
        const offeredTools = (call: number) =>
          generateContentStream.mock.calls[call][0].config.tools[0].functionDeclarations.map(
            ({ name }: { name: string }) => name
          )

        // Staff can't change the catalog, so they aren't offered these tools.
        generateContentStream.mockResolvedValueOnce(
          streamOf({ text: "Only an owner or admin can do that." })
        )
        await api.post(
          assistant,
          { message: "Publish the Kikoi" },
          { headers: staffHeaders, responseType: "text" }
        )
        expect(offeredTools(0)).toContain("propose_order_note")
        expect(offeredTools(0)).not.toContain("propose_publish_product")
        expect(offeredTools(0)).not.toContain("propose_product_description")
        expect(offeredTools(0)).not.toContain("propose_collection_products")

        // The owner gets all three suggestions in one turn.
        generateContentStream
          .mockResolvedValueOnce(
            streamOf(
              {
                functionCall: {
                  id: "call_publish",
                  name: "propose_publish_product",
                  args: { product_id: kikoi.id, summary: "It has a price." },
                },
              },
              {
                functionCall: {
                  id: "call_description",
                  name: "propose_product_description",
                  args: {
                    product_id: kikoi.id,
                    description: "A soft cotton kikoi.",
                    summary: "The current text is short.",
                  },
                },
              },
              {
                functionCall: {
                  id: "call_collection",
                  name: "propose_collection_products",
                  args: {
                    collection_id: summer.id,
                    product_ids: [kikoi.id, tote.id],
                    summary: "Both are summer items.",
                  },
                },
              }
            )
          )
          .mockResolvedValueOnce(
            streamOf({ text: "I've suggested three changes for you to approve." })
          )
        const answered = await api.post(
          assistant,
          { message: "Get the Kikoi ready for summer" },
          { headers: ownerHeaders, responseType: "text" }
        )
        const lines = parseLines(answered.data)
        const sessionId = lines[0].session_id
        const proposals = Object.fromEntries(
          lines
            .filter(({ type }) => type === "proposal")
            .map(({ proposal }) => [proposal.action, proposal])
        )

        expect(offeredTools(1)).toContain("propose_collection_products")
        expect(proposals.publish_product).toMatchObject({
          args: { product_id: kikoi.id },
          preview: { title: "Kikoi", status: "draft" },
        })
        expect(proposals.update_product_description).toMatchObject({
          args: { product_id: kikoi.id, description: "A soft cotton kikoi." },
          preview: { current_description: "Kikoi, old text." },
        })
        expect(proposals.add_collection_products).toMatchObject({
          args: { collection_id: summer.id, product_ids: [kikoi.id, tote.id] },
          preview: {
            collection_title: "Summer",
            products: [
              { id: kikoi.id, current_collection: null },
              { id: tote.id, current_collection: "Bags" },
            ],
          },
        })

        // Nothing has changed yet.
        expect(await productState(kikoi.id)).toEqual({
          status: "draft",
          description: "Kikoi, old text.",
          collection_id: null,
        })
        expect((await productState(tote.id)).collection_id).toBe(bags.id)

        const resolve = (action: string, body: Record<string, unknown>) =>
          api.post(`${assistant}/proposals/${proposals[action].id}`, body, {
            headers: ownerHeaders,
          })

        // Approving each: the dashboard calls the catalog route, then
        // records the outcome with the member's edits.
        await api.post(
          `${merchantPath}/products/${kikoi.id}`,
          { update: { status: "published" } },
          { headers: ownerHeaders }
        )
        await resolve("publish_product", { status: "approved" })

        await api.post(
          `${merchantPath}/products/${kikoi.id}`,
          { update: { description: "A soft blue cotton kikoi." } },
          { headers: ownerHeaders }
        )
        await resolve("update_product_description", {
          status: "approved",
          edits: { description: "A soft blue cotton kikoi." },
        })

        // The member can leave products out, but not add others.
        await expect(
          resolve("add_collection_products", {
            status: "approved",
            edits: { product_ids: [tote.id, "prod_other"] },
          })
        ).rejects.toMatchObject({ response: { status: 400 } })
        await api.post(
          `${merchantPath}/collections/${summer.id}/products`,
          { add: [tote.id] },
          { headers: ownerHeaders }
        )
        await resolve("add_collection_products", {
          status: "approved",
          edits: { product_ids: [tote.id] },
        })

        expect(await productState(kikoi.id)).toEqual({
          status: "published",
          description: "A soft blue cotton kikoi.",
          collection_id: null,
        })
        expect((await productState(tote.id)).collection_id).toBe(summer.id)

        // The reopened chat shows what was applied.
        const detail = await api.get(`${assistant}/sessions/${sessionId}`, {
          headers: ownerHeaders,
        })
        const saved = Object.fromEntries(
          detail.data.session.messages
            .at(-1)
            .proposals.map((proposal: { action: string }) => [
              proposal.action,
              proposal,
            ])
        )
        expect(saved.publish_product.status).toBe("approved")
        expect(saved.update_product_description.args.description).toBe(
          "A soft blue cotton kikoi."
        )
        expect(saved.add_collection_products.args.product_ids).toEqual([
          tote.id,
        ])

        // Publishing again isn't suggested once the product is live.
        generateContentStream
          .mockResolvedValueOnce(
            streamOf({
              functionCall: {
                id: "call_again",
                name: "propose_publish_product",
                args: { product_id: kikoi.id, summary: "Again." },
              },
            })
          )
          .mockResolvedValueOnce(streamOf({ text: "It's already live." }))
        const again = await api.post(
          assistant,
          { message: "Publish the Kikoi", session_id: sessionId },
          { headers: ownerHeaders, responseType: "text" }
        )
        expect(
          parseLines(again.data).some(({ type }) => type === "proposal")
        ).toBe(false)
        // The model's last request carries the tool's answer.
        const toolAnswer =
          generateContentStream.mock.calls.at(-1)[0].contents.at(-1).parts[0]
            .functionResponse
        expect(toolAnswer.response).toEqual({
          error: "Kikoi is already published",
        })
      })

      it("suggests segment changes that only owners and admins can approve", async () => {
        const container = getContainer()
        const userService = container.resolve(Modules.USER)
        const customerService = container.resolve(Modules.CUSTOMER)
        const merchantService =
          container.resolve<MerchantModuleService>(MERCHANT_MODULE)
        const owner = await userService.createUsers({
          email: "segment-owner@test.local",
        })
        const staff = await userService.createUsers({
          email: "segment-staff@test.local",
        })
        const { result: merchant } = await provisionMerchantWorkflow(
          container
        ).run({
          input: {
            name: "Segment Suggestions Shop",
            slug: "segment-suggestions-shop",
            platform_hostname: "segment-suggestions.shop.localhost",
            owner_actor_id: owner.id,
          },
        })
        await merchantService.createMerchantMembers({
          merchant_id: merchant.merchant.id,
          actor_id: staff.id,
          role: "staff",
          status: "active",
        })

        const ownerHeaders = {
          Authorization: `Bearer ${await tokenFor(owner.id, "segment-owner")}`,
        }
        const staffHeaders = {
          Authorization: `Bearer ${await tokenFor(staff.id, "segment-staff")}`,
        }
        const merchantPath = `/admin/merchants/${merchant.merchant.id}`
        const assistant = `${merchantPath}/assistant`
        const createCustomer = async (first_name: string) => {
          const { data } = await api.post(
            `${merchantPath}/customers`,
            {
              customer: {
                email: `${first_name.toLowerCase()}@segments.test`,
                first_name,
                last_name: "Otieno",
              },
            },
            { headers: ownerHeaders }
          )
          return data.customer as { id: string }
        }
        const amina = await createCustomer("Amina")
        const brian = await createCustomer("Brian")
        const joy = await createCustomer("Joy")
        // A customer record this store has never dealt with.
        const outsider = await customerService.createCustomers({
          email: "outsider@segments.test",
        })
        const {
          data: { customer_segment: vip },
        } = await api.post(
          `${merchantPath}/customer-segments`,
          { name: "VIP", customer_ids: [amina.id] },
          { headers: ownerHeaders }
        )
        expect(vip.customer_count).toBe(1)
        const membersOf = async (segmentId: string) => {
          const { data } = await api.get(
            `${merchantPath}/customer-segments/${segmentId}`,
            { headers: ownerHeaders }
          )
          return data.customer_segment.customers
            .map(({ id }: { id: string }) => id)
            .sort()
        }
        const segmentNames = async () => {
          const { data } = await api.get(`${merchantPath}/customer-segments`, {
            headers: ownerHeaders,
          })
          return data.customer_segments.map(({ name }: { name: string }) => name)
        }
        const offeredTools = (call: number) =>
          generateContentStream.mock.calls[call][0].config.tools[0].functionDeclarations.map(
            ({ name }: { name: string }) => name
          )

        // Staff can't change segments, so they aren't offered these tools.
        generateContentStream.mockResolvedValueOnce(
          streamOf({ text: "Only an owner or admin can do that." })
        )
        await api.post(
          assistant,
          { message: "Put Brian in VIP" },
          { headers: staffHeaders, responseType: "text" }
        )
        expect(offeredTools(0)).toContain("analyze_customers")
        expect(offeredTools(0)).not.toContain("propose_segment_customers")
        expect(offeredTools(0)).not.toContain("propose_create_segment")

        generateContentStream
          .mockResolvedValueOnce(
            streamOf(
              {
                functionCall: {
                  id: "call_create",
                  name: "propose_create_segment",
                  args: {
                    name: "Lapsed regulars",
                    description: "Bought before, not lately.",
                    customer_ids: [brian.id, joy.id],
                    summary: "So you can win them back.",
                  },
                },
              },
              {
                functionCall: {
                  id: "call_update",
                  name: "propose_segment_customers",
                  args: {
                    segment_id: vip.id,
                    add: [brian.id],
                    remove: [amina.id],
                    summary: "Brian buys more than Amina now.",
                  },
                },
              }
            )
          )
          .mockResolvedValueOnce(
            streamOf({ text: "I've suggested two segment changes." })
          )
        const answered = await api.post(
          assistant,
          { message: "Sort out my segments" },
          { headers: ownerHeaders, responseType: "text" }
        )
        const lines = parseLines(answered.data)
        const sessionId = lines[0].session_id
        const proposals = Object.fromEntries(
          lines
            .filter(({ type }) => type === "proposal")
            .map(({ proposal }) => [proposal.action, proposal])
        )

        expect(proposals.create_segment).toMatchObject({
          args: {
            name: "Lapsed regulars",
            description: "Bought before, not lately.",
            customer_ids: [brian.id, joy.id],
          },
          preview: {
            customers: [
              { id: brian.id, name: "Brian Otieno", email: "b***@segments.test" },
              { id: joy.id, name: "Joy Otieno", email: "j***@segments.test" },
            ],
          },
        })
        expect(proposals.update_segment_customers).toMatchObject({
          args: { segment_id: vip.id, add: [brian.id], remove: [amina.id] },
          preview: { segment_name: "VIP" },
        })

        // Nothing has changed yet.
        expect(await segmentNames()).toEqual(["VIP"])
        expect(await membersOf(vip.id)).toEqual([amina.id])

        const resolve = (action: string, body: Record<string, unknown>) =>
          api.post(`${assistant}/proposals/${proposals[action].id}`, body, {
            headers: ownerHeaders,
          })

        // A customer the store doesn't know is refused, and no empty segment
        // is left behind.
        await expect(
          api.post(
            `${merchantPath}/customer-segments`,
            { name: "Lapsed", customer_ids: [joy.id, outsider.id] },
            { headers: ownerHeaders }
          )
        ).rejects.toMatchObject({ response: { status: 404 } })
        expect(await segmentNames()).toEqual(["VIP"])

        // Approving the new segment: renamed, and Brian left out.
        const {
          data: { customer_segment: lapsed },
        } = await api.post(
          `${merchantPath}/customer-segments`,
          { name: "Lapsed", description: null, customer_ids: [joy.id] },
          { headers: ownerHeaders }
        )
        expect(lapsed).toMatchObject({ name: "Lapsed", customer_count: 1 })
        await resolve("create_segment", {
          status: "approved",
          edits: { name: "Lapsed", description: null, customer_ids: [joy.id] },
        })
        expect(await membersOf(lapsed.id)).toEqual([joy.id])

        // The member can leave customers out, but not add others.
        await expect(
          resolve("update_segment_customers", {
            status: "approved",
            edits: { add: [brian.id, joy.id], remove: [amina.id] },
          })
        ).rejects.toMatchObject({ response: { status: 400 } })
        await api.post(
          `${merchantPath}/customer-segments/${vip.id}/customers`,
          { add: [brian.id], remove: [amina.id] },
          { headers: ownerHeaders }
        )
        await resolve("update_segment_customers", {
          status: "approved",
          edits: { add: [brian.id], remove: [amina.id] },
        })
        expect(await membersOf(vip.id)).toEqual([brian.id])

        // The reopened chat shows what was applied, and the model is told.
        const detail = await api.get(`${assistant}/sessions/${sessionId}`, {
          headers: ownerHeaders,
        })
        const saved = Object.fromEntries(
          detail.data.session.messages
            .at(-1)
            .proposals.map((proposal: { action: string }) => [
              proposal.action,
              proposal,
            ])
        )
        expect(saved.create_segment).toMatchObject({
          status: "approved",
          args: { name: "Lapsed", description: null, customer_ids: [joy.id] },
        })
        generateContentStream.mockResolvedValueOnce(streamOf({ text: "Done." }))
        await api.post(
          assistant,
          { message: "Thanks", session_id: sessionId },
          { headers: ownerHeaders, responseType: "text" }
        )
        expect(
          generateContentStream.mock.calls.at(-1)[0].contents[1].parts[0].text
        ).toContain(
          '[Suggestion card: create the "Lapsed" segment with "Joy Otieno" - approved by the owner and done]'
        )
      })
    })
  },
})
