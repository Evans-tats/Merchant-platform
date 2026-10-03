// The assistant is asked for plain text, but models still slip in a little
// markdown. This turns the bits they use (**bold**, # headings and ***
// dividers) into display lines, and gives clean text for copying.

export type AssistantLine =
  | { kind: "divider" }
  | { kind: "text"; segments: Array<{ text: string; bold: boolean }> }

const dividerPattern = /^\s*(?:\*{3,}|-{3,}|_{3,})\s*$/
const headingPattern = /^\s{0,3}#{1,6}\s+/

export const parseAssistantText = (text: string): AssistantLine[] =>
  text.split("\n").map((line) => {
    if (dividerPattern.test(line)) {
      return { kind: "divider" }
    }

    if (headingPattern.test(line)) {
      const heading = line.replace(headingPattern, "").replace(/\*\*/g, "")
      return { kind: "text", segments: [{ text: heading, bold: true }] }
    }

    // Splitting on a captured group puts the bold parts at odd indexes.
    const segments = line
      .split(/\*\*(.+?)\*\*/)
      .map((part, index) => ({ text: part, bold: index % 2 === 1 }))
      .filter(({ text: part }) => part.length > 0)

    return { kind: "text", segments }
  })

export const plainAssistantText = (text: string): string =>
  parseAssistantText(text)
    .map((line) =>
      line.kind === "divider"
        ? ""
        : line.segments.map(({ text: part }) => part).join("")
    )
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
