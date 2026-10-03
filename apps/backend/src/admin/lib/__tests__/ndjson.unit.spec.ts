import { readNdjson } from "../ndjson"

const streamOf = (...chunks: string[]) => {
  const encoder = new TextEncoder()

  return new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)))
      controller.close()
    },
  })
}

describe("readNdjson", () => {
  it("joins lines that arrive split across reads", async () => {
    const values: unknown[] = []

    await readNdjson(
      streamOf(
        '{"type":"session_id","session_id":"agsess_1"}\n{"type":"te',
        'xt","content":"Sales are up"}\n\n',
        '{"type":"done"}'
      ),
      (value) => values.push(value)
    )

    expect(values).toEqual([
      { type: "session_id", session_id: "agsess_1" },
      { type: "text", content: "Sales are up" },
      { type: "done" },
    ])
  })

  it("keeps multi-byte characters split between reads intact", async () => {
    const bytes = new TextEncoder().encode('{"content":"KSh 1,500 – sawa"}\n')
    const dash = bytes.indexOf(0xe2)
    const values: unknown[] = []

    await readNdjson(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes.slice(0, dash + 1))
          controller.enqueue(bytes.slice(dash + 1))
          controller.close()
        },
      }),
      (value) => values.push(value)
    )

    expect(values).toEqual([{ content: "KSh 1,500 – sawa" }])
  })
})
