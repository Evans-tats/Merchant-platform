const generateContent = jest.fn()

jest.mock("@google/genai", () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: { generateContent },
  })),
  ThinkingLevel: { LOW: "LOW" },
}))

import {
  draftProductPhoto,
  isProductPhotoDraftEnabled,
  ProductPhotoDraftError,
} from "../draft-product-photo"

const blackShoe = { mimeType: "image/jpeg", base64: "YmxhY2s=" }
const brownShoe = { mimeType: "image/webp", base64: "YnJvd24=" }

const validDraft = {
  photo_usable: true,
  retake_advice: null,
  title: "Lace-Up Sneakers with White Sole",
  description: "Low-top sneakers with a white sole. Available in black and brown.",
  category: "Shoes",
  options: [{ title: "Colour", values: ["Black", "Brown"] }],
  visible_brand: null,
  confidence: "high",
  notes_for_merchant: "Add the available sizes.",
  mixed_products: false,
  photos: [
    { index: 1, option_values: [{ option: "Colour", value: "Black" }] },
    { index: 2, option_values: [{ option: "Colour", value: "Brown" }] },
  ],
}

const geminiResponse = (draft: unknown) => ({
  text: JSON.stringify(draft),
  usageMetadata: {
    promptTokenCount: 2800,
    candidatesTokenCount: 180,
    thoughtsTokenCount: 0,
  },
})

const busyError = () =>
  Object.assign(new Error("This model is currently experiencing high demand"), {
    status: 503,
  })

describe("draftProductPhoto", () => {
  const originalKey = process.env.GEMINI_API_KEY

  beforeEach(() => {
    generateContent.mockReset()
    process.env.GEMINI_API_KEY = "test-key"
  })

  afterAll(() => {
    process.env.GEMINI_API_KEY = originalKey
  })

  it("sends every photo and constrains the category to the shop's list", async () => {
    generateContent.mockResolvedValueOnce(geminiResponse(validDraft))

    const result = await draftProductPhoto({
      images: [blackShoe, brownShoe],
      categories: ["Shoes", "Bags", "Shoes"],
    })

    expect(result.model).toBe("gemini-3.8-flash")
    expect(result.draft.title).toBe(validDraft.title)
    expect(result.draft.photos).toEqual(validDraft.photos)
    expect(result.usage).toEqual({ input: 2800, output: 180, thinking: 0 })

    const request = generateContent.mock.calls[0][0]
    expect(request.contents[0].parts.slice(0, 2)).toEqual([
      { inlineData: { mimeType: "image/jpeg", data: blackShoe.base64 } },
      { inlineData: { mimeType: "image/webp", data: brownShoe.base64 } },
    ])
    expect(JSON.stringify(request.config.responseJsonSchema)).toContain(
      '"enum":["Shoes","Bags"]'
    )
    expect(request.config.systemInstruction).toContain("Never suggest or mention a price")
    expect(request.config.systemInstruction).toContain("free of any one colour")
  })

  it("drops photo links to photos or option values that don't exist", async () => {
    generateContent.mockResolvedValueOnce(geminiResponse({
      ...validDraft,
      photos: [
        { index: 1, option_values: [{ option: "Colour", value: "Black" }] },
        { index: 2, option_values: [{ option: "Colour", value: "Purple" }] },
        { index: 7, option_values: [{ option: "Colour", value: "Brown" }] },
      ],
    }))

    const { draft } = await draftProductPhoto({
      images: [blackShoe, brownShoe],
      categories: ["Shoes"],
    })

    expect(draft.photos).toEqual([
      { index: 1, option_values: [{ option: "Colour", value: "Black" }] },
      { index: 2, option_values: [] },
    ])
  })

  it("falls back to the next model when the first stays busy", async () => {
    generateContent
      .mockRejectedValueOnce(busyError())
      .mockRejectedValueOnce(busyError())
      .mockResolvedValueOnce(geminiResponse(validDraft))

    const result = await draftProductPhoto({
      images: [blackShoe],
      categories: ["Shoes"],
      retryDelayMs: 0,
    })

    expect(result.model).toBe("gemini-3.5-flash")
    expect(generateContent.mock.calls.map(([request]) => request.model)).toEqual([
      "gemini-3.8-flash",
      "gemini-3.8-flash",
      "gemini-3.5-flash",
    ])
  })

  it("rejects a draft that doesn't match the schema", async () => {
    generateContent.mockResolvedValue(
      geminiResponse({ ...validDraft, category: "Invented category" })
    )

    await expect(
      draftProductPhoto({ images: [blackShoe], categories: ["Shoes"], retryDelayMs: 0 })
    ).rejects.toMatchObject({ reason: "invalid_response" })
  })

  it("refuses more photos than one draft allows", async () => {
    await expect(
      draftProductPhoto({
        images: Array.from({ length: 6 }, () => blackShoe),
        categories: [],
      })
    ).rejects.toBeInstanceOf(ProductPhotoDraftError)
    expect(generateContent).not.toHaveBeenCalled()
  })

  it("reports when no API key is configured", async () => {
    delete process.env.GEMINI_API_KEY

    expect(isProductPhotoDraftEnabled()).toBe(false)
    await expect(
      draftProductPhoto({ images: [blackShoe], categories: [] })
    ).rejects.toMatchObject({ reason: "not_configured" })
    expect(generateContent).not.toHaveBeenCalled()
  })
})
