import type {
  Content,
  FunctionCall,
  FunctionCallingConfigMode,
  GenerateContentParameters,
  GenerateContentResponse,
  Part,
  ThinkingLevel,
} from "@google/genai" with { "resolution-mode": "import" }

import type { AssistantHistoryMessage } from "../../workflows/store-assistant"
import type { StoreAssistantProposal } from "./proposals"
import {
  runStoreAssistantTool,
  storeAssistantFunctionDeclarations,
  type StoreAssistantToolContext,
} from "./tools"

// Same models and fallback order as product photo drafts.
export const DEFAULT_ASSISTANT_MODELS = ["gemini-3.8-flash", "gemini-3.5-flash"]

// Model turns per reply. Each turn can call several tools at once, so this
// covers any question the tools can answer, and stops a model that loops.
const maxSteps = 8
const retryableStatuses = [429, 500, 503]
const retryDelayMs = 2000

export type StoreAssistantEvent =
  | { type: "text"; content: string }
  | { type: "tool_call"; id: string; tool: string }
  | { type: "tool_result"; id: string; tool: string; ok: boolean }
  | { type: "proposal"; proposal: StoreAssistantProposal }

export class StoreAssistantError extends Error {
  reason: "not_configured" | "unavailable"

  constructor(reason: StoreAssistantError["reason"], message: string) {
    super(message)
    this.reason = reason
  }
}

type ContentStreamClient = {
  generateContentStream: (
    params: GenerateContentParameters
  ) => Promise<AsyncIterable<GenerateContentResponse>>
}

export const isStoreAssistantEnabled = () =>
  Boolean(process.env.GEMINI_API_KEY)

const isRetryable = (error: unknown) => {
  const status = (error as { status?: unknown } | null)?.status
  return typeof status === "number" && retryableStatuses.includes(status)
}

const toContent = ({ role, content }: AssistantHistoryMessage): Content => ({
  role: role === "assistant" ? "model" : "user",
  parts: [{ text: content }],
})

const createGeminiClient = async (
  apiKey: string
): Promise<ContentStreamClient> => {
  // @google/genai publishes ESM type definitions, which this CommonJS
  // backend can only reference through import().
  const { GoogleGenAI } = await import("@google/genai")
  return new GoogleGenAI({ apiKey }).models
}

export async function runStoreAssistant(input: {
  history: AssistantHistoryMessage[]
  systemInstruction: string
  toolContext: StoreAssistantToolContext
  emit: (event: StoreAssistantEvent) => void
  apiKey?: string
  models?: string[]
  client?: ContentStreamClient
  retryDelayMs?: number
}): Promise<{ text: string; tools: string[]; model: string }> {
  const apiKey = input.apiKey ?? process.env.GEMINI_API_KEY
  if (!input.client && !apiKey) {
    throw new StoreAssistantError("not_configured", "GEMINI_API_KEY is not set")
  }

  const client = input.client ?? (await createGeminiClient(apiKey!))
  const models = input.models ?? DEFAULT_ASSISTANT_MODELS
  const contents = input.history.map(toContent)
  const functionDeclarations = storeAssistantFunctionDeclarations(
    input.toolContext.role
  )
  const toolsUsed: string[] = []
  let modelIndex = 0
  let text = ""

  // Opens a stream on the first model that answers, retrying once on "high
  // demand" errors, which Gemini returns often and which usually clear
  // within seconds. Later turns stay on the model that worked.
  const openStream = async (lastStep: boolean) => {
    let lastError: unknown

    for (; modelIndex < models.length; modelIndex += 1) {
      const model = models[modelIndex]

      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          return await client.generateContentStream({
            model,
            contents: [...contents],
            config: {
              systemInstruction: input.systemInstruction,
              tools: [{ functionDeclarations }],
              // On the last turn the model must answer with what it has.
              ...(lastStep && {
                toolConfig: {
                  functionCallingConfig: {
                    mode: "NONE" as FunctionCallingConfigMode,
                  },
                },
              }),
              ...(model.startsWith("gemini-3") && {
                thinkingConfig: { thinkingLevel: "LOW" as ThinkingLevel },
              }),
            },
          })
        } catch (error) {
          lastError = error
          if (!isRetryable(error)) {
            break
          }
          if (attempt === 0) {
            await new Promise((resolve) =>
              setTimeout(resolve, input.retryDelayMs ?? retryDelayMs)
            )
          }
        }
      }
    }

    throw new StoreAssistantError(
      "unavailable",
      lastError instanceof Error ? lastError.message : String(lastError)
    )
  }

  for (let step = 0; step < maxSteps; step += 1) {
    const stream = await openStream(step === maxSteps - 1)
    // The model's parts go back to it unchanged on the next turn: Gemini 3
    // rejects function calls that lose their thought signatures.
    const modelParts: Part[] = []
    const calls: FunctionCall[] = []

    try {
      for await (const chunk of stream) {
        for (const part of chunk.candidates?.[0]?.content?.parts ?? []) {
          modelParts.push(part)

          if (part.functionCall) {
            calls.push(part.functionCall)
          } else if (part.text && !part.thought) {
            text += part.text
            input.emit({ type: "text", content: part.text })
          }
        }
      }
    } catch (error) {
      throw new StoreAssistantError(
        "unavailable",
        error instanceof Error ? error.message : String(error)
      )
    }

    contents.push({ role: "model", parts: modelParts })

    if (!calls.length) {
      break
    }

    const responses = await Promise.all(
      calls.map(async (call, index) => {
        const name = call.name ?? ""
        const id = call.id ?? `${step}-${index}`

        input.emit({ type: "tool_call", id, tool: name })
        const response = await runStoreAssistantTool(
          name,
          call.args,
          input.toolContext
        )
        toolsUsed.push(name)
        input.emit({
          type: "tool_result",
          id,
          tool: name,
          ok: !("error" in response),
        })

        return {
          functionResponse: { id: call.id, name, response },
        }
      })
    )

    contents.push({ role: "user", parts: responses })
  }

  return { text, tools: toolsUsed, model: models[modelIndex] }
}
