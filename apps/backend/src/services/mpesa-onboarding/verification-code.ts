import { createHmac, randomInt, timingSafeEqual } from "node:crypto"

import type { Logger } from "@medusajs/framework/types"
import { MedusaError } from "@medusajs/framework/utils"

import { maskMsisdn } from "./parsing"

export const CODE_TTL_MS = 10 * 60 * 1000
export const MAX_CODE_ATTEMPTS = 3
export const MAX_LOOKUP_ATTEMPTS = 5
export const LOCK_DURATION_MS = 30 * 60 * 1000

function hashSecret(): string {
  const secret = process.env.MPESA_ONBOARDING_SECRET || process.env.JWT_SECRET

  if (!secret) {
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      "Set MPESA_ONBOARDING_SECRET to issue verification codes"
    )
  }

  return secret
}

export function generateVerificationCode(): string {
  // Lets automated tests drive the conversation. Never honored in production.
  const fixedCode = process.env.MPESA_ONBOARDING_FIXED_CODE
  if (fixedCode && process.env.NODE_ENV !== "production") {
    return fixedCode
  }

  return String(randomInt(0, 1_000_000)).padStart(6, "0")
}

export function hashVerificationCode(sessionId: string, code: string): string {
  return createHmac("sha256", hashSecret())
    .update(`${sessionId}:${code}`)
    .digest("hex")
}

export function verificationCodeMatches(
  sessionId: string,
  code: string,
  expectedHash: string
): boolean {
  const actual = Buffer.from(hashVerificationCode(sessionId, code), "hex")
  const expected = Buffer.from(expectedHash, "hex")

  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

// Simulated SMS for the proof of concept. Replace with an SMS gateway (or the
// registry's own owner-notification API) before real merchants use this.
export function deliverVerificationCode(
  logger: Logger,
  input: { to_msisdn: string; code: string }
) {
  logger.info(
    `[SIMULATED SMS to ${maskMsisdn(input.to_msisdn)}] Your M-PESA Online Store verification code is ${input.code}. It expires in 10 minutes.`
  )
}
