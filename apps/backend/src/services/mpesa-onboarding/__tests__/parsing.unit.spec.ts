import { messagesFor } from "../messages"
import {
  isNo,
  isYes,
  maskMsisdn,
  normalizeMsisdn,
  parseAccountNumber,
  parseMenuChoice,
  parseProductLine,
  parseStoreName,
  slugify,
  toTitleCase,
} from "../parsing"
import {
  hashVerificationCode,
  verificationCodeMatches,
} from "../verification-code"

describe("M-PESA onboarding parsing", () => {
  it("normalizes Kenyan phone numbers", () => {
    expect(normalizeMsisdn("0712345678")).toBe("254712345678")
    expect(normalizeMsisdn("+254 712 345 678")).toBe("254712345678")
    expect(normalizeMsisdn("254112345678")).toBe("254112345678")
    expect(normalizeMsisdn("712-345-678")).toBe("254712345678")
    expect(normalizeMsisdn("0812345678")).toBeNull()
    expect(normalizeMsisdn("07123456")).toBeNull()
    expect(normalizeMsisdn("hello")).toBeNull()
  })

  it("masks phone numbers for display", () => {
    expect(maskMsisdn("254712345678")).toBe("0712***678")
  })

  it("accepts Till and Paybill numbers of 5 to 7 digits", () => {
    expect(parseAccountNumber("5123456")).toBe("5123456")
    expect(parseAccountNumber("401 234")).toBe("401234")
    expect(parseAccountNumber("1234")).toBeNull()
    expect(parseAccountNumber("12345678")).toBeNull()
    expect(parseAccountNumber("51234a6")).toBeNull()
  })

  it("parses products written the way merchants type them", () => {
    expect(parseProductLine("Unga 2kg, 250")).toEqual({ title: "Unga 2kg", price: 250 })
    expect(parseProductLine("Sukuma wiki @ 30 bob")).toEqual({ title: "Sukuma wiki", price: 30 })
    expect(parseProductLine("T-shirt, KES 1,500")).toEqual({ title: "T-shirt", price: 1500 })
    expect(parseProductLine("Shoes - Ksh. 2,499.50")).toEqual({ title: "Shoes", price: 2499.5 })
    expect(parseProductLine("Maziwa at 60/-")).toEqual({ title: "Maziwa", price: 60 })
  })

  it("rejects products without a usable price", () => {
    expect(parseProductLine("Unga 2kg")).toBeNull()
    expect(parseProductLine("Unga, free")).toBeNull()
    expect(parseProductLine("Unga, 0")).toBeNull()
    expect(parseProductLine("U, 50")).toBeNull()
  })

  it("reads menu choices, yes/no answers, and store names", () => {
    expect(parseMenuChoice("2", 3)).toBe(2)
    expect(parseMenuChoice("4", 3)).toBeNull()
    expect(parseMenuChoice("1.5", 3)).toBeNull()
    expect(isYes("Ndio")).toBe(true)
    expect(isYes("yes ")).toBe(true)
    expect(isNo("hapana")).toBe(true)
    expect(parseStoreName("  Mama   Njeri  Groceries ")).toBe("Mama Njeri Groceries")
    expect(parseStoreName("A")).toBeNull()
  })

  it("builds readable names and slugs", () => {
    expect(toTitleCase("MAMA NJERI GROCERIES")).toBe("Mama Njeri Groceries")
    expect(slugify("Mama Njeri's Groceries!")).toBe("mama-njeri-s-groceries")
    expect(slugify("x".repeat(60)).length).toBeLessThanOrEqual(40)
  })

  it("has the same messages in English and Kiswahili", () => {
    const englishKeys = Object.keys(messagesFor("en")).sort()

    expect(Object.keys(messagesFor("sw")).sort()).toEqual(englishKeys)
  })
})

describe("M-PESA ownership codes", () => {
  const originalSecret = process.env.MPESA_ONBOARDING_SECRET

  beforeAll(() => {
    process.env.MPESA_ONBOARDING_SECRET = "test-secret"
  })

  afterAll(() => {
    process.env.MPESA_ONBOARDING_SECRET = originalSecret
  })

  it("matches only the right code for the right session", () => {
    const hash = hashVerificationCode("mponb_1", "123456")

    expect(hash).not.toContain("123456")
    expect(verificationCodeMatches("mponb_1", "123456", hash)).toBe(true)
    expect(verificationCodeMatches("mponb_1", "654321", hash)).toBe(false)
    expect(verificationCodeMatches("mponb_2", "123456", hash)).toBe(false)
  })
})
