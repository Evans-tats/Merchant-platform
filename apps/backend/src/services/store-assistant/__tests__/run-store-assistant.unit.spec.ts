const runStoreAssistantTool = jest.fn()
const storeAssistantFunctionDeclarations = jest.fn(() => [
  { name: "get_sales_summary", description: "Sales", parametersJsonSchema: {} },
])

jest.mock("../tools", () => ({
  runStoreAssistantTool: (...args: unknown[]) => runStoreAssistantTool(...args),
  storeAssistantFunctionDeclarations: (...args: unknown[]) =>
    storeAssistantFunctionDeclarations(...(args as [])),
}))

import type { ResolvedMerchantId } from "../../tenant-resolution"
import {
  runStoreAssistant,
  StoreAssistantError,
  type StoreAssistantEvent,
} from "../run-store-assistant"

type Chunk = { candidates: Array<{ content: { parts: object[] } }> }

const chunk = (...parts: object[]): Chunk => ({
  candidates: [{ content: { parts } }],
})

async function* streamOf(...chunks: Chunk[]) {
  for (const item of chunks) {
    yield item
  }
}

const toolContext = {
  container: {} as never,
  merchant_id: "mer_a" as ResolvedMerchantId,
  sales_channel_id: "sc_a",
  role: "staff" as const,
  propose: jest.fn(),
}

const run = (
  generateContentStream: jest.Mock,
  events: StoreAssistantEvent[] = []
) =>
  runStoreAssistant({
    history: [{ role: "user", content: "How is my business doing this week?" }],
    systemInstruction: "You are the store assistant",
    toolContext,
    emit: (event) => events.push(event),
    client: { generateContentStream },
    retryDelayMs: 0,
  })

describe("runStoreAssistant", () => {
  beforeEach(() => {
    runStoreAssistantTool.mockReset()
  })

  it("streams text and runs the tools the model asks for", async () => {
    const signedCall = {
      functionCall: {
        id: "call_1",
        name: "get_sales_summary",
        args: { range: "7d" },
      },
      thoughtSignature: "sig-1",
    }
    const generateContentStream = jest
      .fn()
      .mockResolvedValueOnce(streamOf(chunk(signedCall)))
      .mockResolvedValueOnce(
        streamOf(chunk({ text: "Sales are up " }), chunk({ text: "12%." }))
      )
    runStoreAssistantTool.mockResolvedValueOnce({
      result: { summary: { sales: 8420 } },
    })
    const events: StoreAssistantEvent[] = []

    const reply = await run(generateContentStream, events)

    expect(reply).toEqual({
      text: "Sales are up 12%.",
      tools: ["get_sales_summary"],
      model: "gemini-3.8-flash",
    })
    expect(events).toEqual([
      { type: "tool_call", id: "call_1", tool: "get_sales_summary" },
      { type: "tool_result", id: "call_1", tool: "get_sales_summary", ok: true },
      { type: "text", content: "Sales are up " },
      { type: "text", content: "12%." },
    ])
    expect(runStoreAssistantTool).toHaveBeenCalledWith(
      "get_sales_summary",
      { range: "7d" },
      toolContext
    )

    // The second request carries the model's call back unchanged, thought
    // signature included, followed by the tool's answer.
    const followUp = generateContentStream.mock.calls[1][0]
    expect(followUp.contents.slice(1)).toEqual([
      { role: "model", parts: [signedCall] },
      {
        role: "user",
        parts: [{
          functionResponse: {
            id: "call_1",
            name: "get_sales_summary",
            response: { result: { summary: { sales: 8420 } } },
          },
        }],
      },
    ])
    expect(followUp.config.systemInstruction).toBe("You are the store assistant")
    expect(followUp.config.thinkingConfig).toEqual({ thinkingLevel: "LOW" })
    // Only the tools this member may use are offered.
    expect(storeAssistantFunctionDeclarations).toHaveBeenCalledWith("staff")
  })

  it("sends earlier messages as user and model turns", async () => {
    const generateContentStream = jest
      .fn()
      .mockResolvedValueOnce(streamOf(chunk({ text: "Done." })))

    await runStoreAssistant({
      history: [
        { role: "user", content: "Hi" },
        { role: "assistant", content: "Hello" },
        { role: "user", content: "What's low on stock?" },
      ],
      systemInstruction: "prompt",
      toolContext,
      emit: () => undefined,
      client: { generateContentStream },
    })

    expect(generateContentStream.mock.calls[0][0].contents).toEqual([
      { role: "user", parts: [{ text: "Hi" }] },
      { role: "model", parts: [{ text: "Hello" }] },
      { role: "user", parts: [{ text: "What's low on stock?" }] },
    ])
  })

  it("marks failed tools and leaves thoughts out of the reply", async () => {
    const generateContentStream = jest
      .fn()
      .mockResolvedValueOnce(
        streamOf(chunk({ functionCall: { name: "list_low_stock", args: {} } }))
      )
      .mockResolvedValueOnce(
        streamOf(chunk({ text: "thinking", thought: true }, { text: "Sorry." }))
      )
    runStoreAssistantTool.mockResolvedValueOnce({ error: "The tool failed" })
    const events: StoreAssistantEvent[] = []

    const reply = await run(generateContentStream, events)

    expect(reply.text).toBe("Sorry.")
    expect(events).toContainEqual({
      type: "tool_result",
      id: "0-0",
      tool: "list_low_stock",
      ok: false,
    })
  })

  it("falls back to the next model when Gemini is overloaded", async () => {
    const overloaded = Object.assign(new Error("high demand"), { status: 503 })
    const generateContentStream = jest
      .fn()
      .mockRejectedValueOnce(overloaded)
      .mockRejectedValueOnce(overloaded)
      .mockResolvedValueOnce(streamOf(chunk({ text: "Hello." })))

    const reply = await run(generateContentStream)

    expect(reply.model).toBe("gemini-3.5-flash")
    expect(
      generateContentStream.mock.calls.map(([params]) => params.model)
    ).toEqual(["gemini-3.8-flash", "gemini-3.8-flash", "gemini-3.5-flash"])
  })

  it("gives up when every model is unavailable", async () => {
    const overloaded = Object.assign(new Error("high demand"), { status: 503 })
    const generateContentStream = jest.fn().mockRejectedValue(overloaded)

    await expect(run(generateContentStream)).rejects.toMatchObject({
      reason: "unavailable",
    })
    expect(generateContentStream).toHaveBeenCalledTimes(4)
  })

  it("stops offering tools on the last turn", async () => {
    const generateContentStream = jest.fn().mockImplementation(async () =>
      streamOf(chunk({ functionCall: { name: "get_sales_summary", args: {} } }))
    )
    runStoreAssistantTool.mockResolvedValue({ result: {} })

    await run(generateContentStream)

    expect(generateContentStream).toHaveBeenCalledTimes(8)
    const lastCall = generateContentStream.mock.calls[7][0]
    expect(lastCall.config.toolConfig).toEqual({
      functionCallingConfig: { mode: "NONE" },
    })
    expect(generateContentStream.mock.calls[6][0].config.toolConfig).toBeUndefined()
  })

  it("needs an API key when no client is given", async () => {
    const originalKey = process.env.GEMINI_API_KEY
    delete process.env.GEMINI_API_KEY

    await expect(
      runStoreAssistant({
        history: [],
        systemInstruction: "prompt",
        toolContext,
        emit: () => undefined,
      })
    ).rejects.toBeInstanceOf(StoreAssistantError)

    process.env.GEMINI_API_KEY = originalKey
  })
})
