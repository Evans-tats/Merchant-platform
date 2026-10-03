import { parseAssistantText, plainAssistantText } from "../assistant-text"

const reply = [
  "Your best seller is the **New balance shoes**.",
  "",
  "***",
  "",
  "## Draft Instagram caption",
  "Step out in comfort. #NeemaFashion",
  "- 2 * 3 = 6 stays as typed",
].join("\n")

describe("parseAssistantText", () => {
  it("turns bold, headings and dividers into display lines", () => {
    expect(parseAssistantText(reply)).toEqual([
      {
        kind: "text",
        segments: [
          { text: "Your best seller is the ", bold: false },
          { text: "New balance shoes", bold: true },
          { text: ".", bold: false },
        ],
      },
      { kind: "text", segments: [] },
      { kind: "divider" },
      { kind: "text", segments: [] },
      {
        kind: "text",
        segments: [{ text: "Draft Instagram caption", bold: true }],
      },
      {
        kind: "text",
        segments: [
          { text: "Step out in comfort. #NeemaFashion", bold: false },
        ],
      },
      {
        kind: "text",
        segments: [{ text: "- 2 * 3 = 6 stays as typed", bold: false }],
      },
    ])
  })
})

describe("plainAssistantText", () => {
  it("copies the words without markdown symbols", () => {
    expect(plainAssistantText(reply)).toBe(
      [
        "Your best seller is the New balance shoes.",
        "",
        "Draft Instagram caption",
        "Step out in comfort. #NeemaFashion",
        "- 2 * 3 = 6 stays as typed",
      ].join("\n")
    )
  })
})
