// Reads a newline-delimited JSON stream, calling onValue for each line.
// Network packets can split a line, so the unfinished tail waits for the
// next read.
export async function readNdjson(
  body: ReadableStream<Uint8Array>,
  onValue: (value: unknown) => void
): Promise<void> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  const flush = (text: string) => {
    if (text.trim()) {
      onValue(JSON.parse(text))
    }
  }

  while (true) {
    const { done, value } = await reader.read()

    if (done) {
      break
    }

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""
    lines.forEach(flush)
  }

  flush(buffer + decoder.decode())
}
