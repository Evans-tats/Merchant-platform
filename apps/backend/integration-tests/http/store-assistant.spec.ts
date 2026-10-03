const generateContentStream = jest.fn()

// The real Gemini API is never called in tests.
jest.mock("@google/genai", () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: { generateContentStream },
  })),
}))

import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { generateJwtToken, Modules } from "@medusajs/framework/utils"
import MerchantModuleService from "../../src/modules/merchant/service"
import { MERCHANT_MODULE } from "../../src/modules/merchant"
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

medusaIntegrationTestRunner({
  moduleName: "merchant-platform-store-assistant",
  cwd: process.cwd(),
  testSuite: ({ api, getContainer }) => {
    describe("store assistant", () => {
      const originalKey = process.env.GEMINI_API_KEY

      beforeEach(() => {
        generateContentStream.mockReset()
        process.env.GEMINI_API_KEY = "test-key"
      })

      afterAll(() => {
        process.env.GEMINI_API_KEY = originalKey
      })

      it("answers from the merchant's own data and keeps chats private", async () => {
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
        const staffA = await userService.createUsers({
          email: "assistant-staff@test.local",
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
        const ownerAHeaders = {
          Authorization: `Bearer ${await tokenFor(ownerA.id, "assistant-owner-a")}`,
        }
        const ownerBHeaders = {
          Authorization: `Bearer ${await tokenFor(ownerB.id, "assistant-owner-b")}`,
        }
        const staffAHeaders = {
          Authorization: `Bearer ${await tokenFor(staffA.id, "assistant-staff-a")}`,
        }
        const assistantA = `/admin/merchants/${merchantA.merchant.id}/assistant`
        const assistantB = `/admin/merchants/${merchantB.merchant.id}/assistant`

        const status = await api.get(assistantA, { headers: ownerAHeaders })
        expect(status.data).toEqual({ enabled: true })

        // The model asks for a sales summary, then answers.
        generateContentStream
          .mockResolvedValueOnce(
            streamOf({
              functionCall: {
                id: "call_1",
                name: "get_sales_summary",
                args: { range: "7d" },
              },
              thoughtSignature: "sig-1",
            })
          )
          .mockResolvedValueOnce(
            streamOf({ text: "No orders yet " }, { text: "in the last 7 days." })
          )
        const answered = await api.post(
          assistantA,
          { message: "How is my business doing this week?" },
          { headers: ownerAHeaders, responseType: "text" }
        )

        expect(answered.status).toBe(200)
        expect(answered.headers["content-type"]).toContain(
          "application/x-ndjson"
        )
        const lines = parseLines(answered.data)
        const sessionId = lines[0].session_id
        expect(lines).toEqual([
          { type: "session_id", session_id: expect.stringMatching(/^agsess_/) },
          { type: "tool_call", id: "call_1", tool: "get_sales_summary" },
          {
            type: "tool_result",
            id: "call_1",
            tool: "get_sales_summary",
            ok: true,
          },
          { type: "text", content: "No orders yet " },
          { type: "text", content: "in the last 7 days." },
          { type: "done" },
        ])

        // The tool really ran against merchant A's (empty) store.
        const followUp = generateContentStream.mock.calls[1][0]
        const toolAnswer = followUp.contents[2].parts[0].functionResponse
        expect(toolAnswer.response.result).toMatchObject({
          currency_code: "kes",
          summary: { sales: 0, orders: 0 },
        })
        expect(followUp.config.systemInstruction).toContain(
          fixtureA.merchant.name
        )

        const sessions = await api.get(`${assistantA}/sessions`, {
          headers: ownerAHeaders,
        })
        expect(sessions.data.sessions).toEqual([
          expect.objectContaining({
            id: sessionId,
            title: "How is my business doing this week?",
          }),
        ])
        const detail = await api.get(`${assistantA}/sessions/${sessionId}`, {
          headers: ownerAHeaders,
        })
        expect(
          detail.data.session.messages.map(
            ({ role, content }: { role: string; content: string }) => ({
              role,
              content,
            })
          )
        ).toEqual([
          { role: "user", content: "How is my business doing this week?" },
          { role: "assistant", content: "No orders yet in the last 7 days." },
        ])

        // A follow-up in the same chat sends the earlier messages along.
        generateContentStream.mockResolvedValueOnce(streamOf({ text: "Sure." }))
        await api.post(
          assistantA,
          { message: "And today?", session_id: sessionId },
          { headers: ownerAHeaders, responseType: "text" }
        )
        expect(
          generateContentStream.mock.calls[2][0].contents.map(
            ({ role }: { role: string }) => role
          )
        ).toEqual(["user", "model", "user"])

        // Other members of the same merchant can't see or continue the chat.
        const staffSessions = await api.get(`${assistantA}/sessions`, {
          headers: staffAHeaders,
        })
        expect(staffSessions.data.sessions).toEqual([])
        await expect(
          api.get(`${assistantA}/sessions/${sessionId}`, {
            headers: staffAHeaders,
          })
        ).rejects.toMatchObject({ response: { status: 404 } })
        await expect(
          api.post(
            assistantA,
            { message: "Show me", session_id: sessionId },
            { headers: staffAHeaders }
          )
        ).rejects.toMatchObject({ response: { status: 404 } })

        // Another merchant can't reach it through either merchant's URL.
        await expect(
          api.get(`${assistantB}/sessions/${sessionId}`, {
            headers: ownerBHeaders,
          })
        ).rejects.toMatchObject({ response: { status: 404 } })
        await expect(
          api.get(`${assistantA}/sessions`, { headers: ownerBHeaders })
        ).rejects.toMatchObject({ response: { status: 404 } })
        expect(generateContentStream).toHaveBeenCalledTimes(3)

        await expect(
          api.post(assistantA, { message: "  " }, { headers: ownerAHeaders })
        ).rejects.toMatchObject({ response: { status: 400 } })

        // A model outage ends the stream with a plain-words error.
        generateContentStream.mockRejectedValue(
          Object.assign(new Error("high demand"), { status: 503 })
        )
        const failed = await api.post(
          assistantA,
          { message: "What's low on stock?" },
          { headers: ownerAHeaders, responseType: "text" }
        )
        expect(parseLines(failed.data).at(-1)).toEqual({
          type: "error",
          message: "The assistant is busy right now. Try again in a minute.",
        })

        delete process.env.GEMINI_API_KEY
        const disabled = await api.get(assistantA, { headers: ownerAHeaders })
        expect(disabled.data).toEqual({ enabled: false })
        await expect(
          api.post(
            assistantA,
            { message: "Hello" },
            { headers: ownerAHeaders }
          )
        ).rejects.toMatchObject({ response: { status: 400 } })
      })
    })
  },
})
