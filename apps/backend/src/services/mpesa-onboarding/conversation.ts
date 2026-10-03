import { randomBytes } from "node:crypto"

import type { MedusaContainer } from "@medusajs/framework/types"

import {
  completeMpesaOnboardingWorkflow,
  requestMpesaOwnershipCodeWorkflow,
  startMpesaOnboardingSessionWorkflow,
  updateMpesaOnboardingSessionWorkflow,
  verifyMpesaOwnershipCodeWorkflow,
} from "../../workflows/mpesa-onboarding"
import type { UpdateOnboardingSessionInput } from "../../workflows/steps/mpesa-onboarding"
import { messagesFor, type OnboardingMessages } from "./messages"
import {
  isNo,
  isYes,
  MAX_ONBOARDING_PRODUCTS,
  type MpesaAccountType,
  type OnboardingAnswers,
  type OnboardingChannel,
  parseAccountNumber,
  parseMenuChoice,
  parseProductLine,
  parseStoreName,
  STORE_CATEGORIES,
  toTitleCase,
} from "./parsing"

export type OnboardingMessageInput = {
  msisdn: string
  channel: OnboardingChannel
  text: string
}

export type OnboardingReply = {
  messages: string[]
  // True once the store has been published.
  done: boolean
}

const ACCOUNT_TYPES: MpesaAccountType[] = ["till", "paybill", "pochi"]

const storefrontUrl = (hostname: string) =>
  (process.env.STOREFRONT_URL_TEMPLATE || "http://{hostname}:8000")
    .replace("{hostname}", hostname)

const adminUrl = () =>
  process.env.MERCHANT_ADMIN_URL || "http://localhost:9000/app"

const parseLanguage = (text: string) => {
  const choice = parseMenuChoice(text, 2)
  if (choice === 1 || /^(en|english)$/i.test(text)) return "en" as const
  if (choice === 2 || /^(sw|kiswahili|swahili)$/i.test(text)) return "sw" as const
  return null
}

// Channel-agnostic conversation engine. Every channel (CLI today, WhatsApp
// and Business Hub later) sends the merchant's message here and relays the
// replies. It only interprets text; every rule that matters for security is
// enforced by the workflows it calls.
export async function handleOnboardingMessage(
  container: MedusaContainer,
  input: OnboardingMessageInput
): Promise<OnboardingReply> {
  const { result: session } = await startMpesaOnboardingSessionWorkflow(
    container
  ).run({ input: { msisdn: input.msisdn, channel: input.channel } })
  const t = messagesFor(session.language)
  const text = input.text.trim()
  const command = text.toUpperCase()
  const answers = (session.answers ?? {}) as OnboardingAnswers
  const scope = { session_id: session.id, msisdn: session.msisdn }
  const reply = (...messages: string[]): OnboardingReply => ({
    messages,
    done: false,
  })
  const update = (
    data: Omit<UpdateOnboardingSessionInput, "session_id" | "msisdn">
  ) =>
    updateMpesaOnboardingSessionWorkflow(container).run({
      input: { ...scope, ...data },
    })

  const requestCode = async (
    accountType: MpesaAccountType,
    accountNumber?: string
  ) => {
    const { result } = await requestMpesaOwnershipCodeWorkflow(container).run({
      input: { ...scope, account_type: accountType, account_number: accountNumber },
    })

    if (result.status === "sent") {
      return reply(t.codeSent(t.accountTypeLabel[accountType], result.sent_to))
    }
    if (result.status === "locked") {
      return reply(t.locked)
    }
    if (accountType === "pochi") {
      await update({ step: "account_type" })
      return reply(t.pochiNotFound, t.accountTypePrompt)
    }
    return reply(t.accountNotFound(result.attempts_left))
  }

  if (session.status === "locked") {
    return reply(t.locked)
  }

  // An empty message means the merchant (re)opened the chat: repeat the
  // current question instead of treating it as an answer.
  if (!text && session.step !== "language") {
    return reply(t.welcomeBack, currentPrompt(t, session, answers))
  }

  if (command === "HELP") {
    return reply(t.help)
  }

  if (command === "RESTART") {
    await update({ reset: true })
    return reply(t.welcome, t.languagePrompt)
  }

  switch (session.step) {
    case "language": {
      const language = parseLanguage(text)
      if (!language) {
        return reply(t.welcome, t.languagePrompt)
      }

      await update({ language, step: "terms" })
      return reply(messagesFor(language).termsPrompt)
    }

    case "terms": {
      if (isYes(text)) {
        await update({ step: "account_type" })
        return reply(t.accountTypePrompt)
      }

      return reply(isNo(text) ? t.termsDeclined : t.termsPrompt)
    }

    case "account_type": {
      const choice = parseMenuChoice(text, ACCOUNT_TYPES.length)
      if (!choice) {
        return reply(t.accountTypePrompt)
      }

      const accountType = ACCOUNT_TYPES[choice - 1]
      if (accountType === "pochi") {
        return requestCode("pochi")
      }

      await update({
        step: "account_number",
        answers: { ...answers, selected_account_type: accountType },
      })
      return reply(t.accountNumberPrompt(t.accountTypeLabel[accountType]))
    }

    case "account_number": {
      const accountType = answers.selected_account_type
      if (!accountType) {
        await update({ step: "account_type" })
        return reply(t.accountTypePrompt)
      }

      const accountNumber = parseAccountNumber(text)
      return accountNumber
        ? requestCode(accountType, accountNumber)
        : reply(t.invalidAccountNumber)
    }

    case "otp": {
      if (command === "RESEND" && session.account_type) {
        return requestCode(session.account_type, session.account_number ?? undefined)
      }

      if (!/^\d{6}$/.test(text)) {
        return reply(t.invalidCodeFormat)
      }

      const { result } = await verifyMpesaOwnershipCodeWorkflow(container).run({
        input: { ...scope, code: text },
      })

      switch (result.status) {
        case "verified":
          return reply(
            t.verified(result.registered_name, toTitleCase(result.registered_name))
          )
        case "invalid":
          return reply(t.invalidCode(result.attempts_left))
        case "expired":
          return reply(t.codeExpired)
        case "already_claimed":
          return reply(t.alreadyClaimed, t.accountTypePrompt)
        case "locked":
          return reply(t.locked)
      }
    }

    case "store_name": {
      const storeName =
        text === "1" && session.registered_name
          ? toTitleCase(session.registered_name)
          : parseStoreName(text)
      if (!storeName) {
        return reply(t.invalidStoreName)
      }

      await update({
        step: "category",
        answers: { ...answers, store_name: storeName },
      })
      return reply(t.categoryPrompt)
    }

    case "category": {
      const choice = parseMenuChoice(text, STORE_CATEGORIES.length)
      if (!choice) {
        return reply(t.categoryPrompt)
      }

      await update({
        step: "products",
        answers: { ...answers, category: STORE_CATEGORIES[choice - 1] },
      })
      return reply(t.productsPrompt(MAX_ONBOARDING_PRODUCTS))
    }

    case "products": {
      const products = answers.products ?? []

      if (command === "DONE") {
        if (!products.length) {
          return reply(t.needProduct)
        }

        await update({ step: "review" })
        return reply(reviewMessage(t, session, answers))
      }

      if (command === "UNDO") {
        const removed = products[products.length - 1]
        if (!removed) {
          return reply(t.productsPrompt(MAX_ONBOARDING_PRODUCTS))
        }

        await update({ answers: { ...answers, products: products.slice(0, -1) } })
        return reply(t.productRemoved(removed.title))
      }

      if (products.length >= MAX_ONBOARDING_PRODUCTS) {
        return reply(t.productLimit(MAX_ONBOARDING_PRODUCTS))
      }

      const product = parseProductLine(text)
      if (!product) {
        return reply(t.invalidProduct)
      }

      await update({ answers: { ...answers, products: [...products, product] } })
      return reply(t.productAdded(product))
    }

    case "review": {
      if (command !== "PUBLISH") {
        return reply(reviewMessage(t, session, answers))
      }

      // Shown once in the CLI. A messaging channel should send a one-time
      // set-password link instead of a password.
      const password = randomBytes(9).toString("base64url")
      try {
        const { result } = await completeMpesaOnboardingWorkflow(container).run({
          input: { ...scope, password },
        })

        return {
          messages: [
            t.published({
              store_url: storefrontUrl(result.hostname),
              admin_url: adminUrl(),
              login_email: result.login_email,
              password: result.created_owner_login ? password : null,
            }),
          ],
          done: true,
        }
      } catch (error) {
        return reply(
          t.publishFailed(error instanceof Error ? error.message : String(error))
        )
      }
    }
  }

  return reply(t.completed)
}

type SessionView = {
  step: string
  account_type: MpesaAccountType | null
  account_number: string | null
  registered_name: string | null
}

function currentPrompt(
  t: OnboardingMessages,
  session: SessionView,
  answers: OnboardingAnswers
): string {
  switch (session.step) {
    case "terms":
      return t.termsPrompt
    case "account_number":
      return answers.selected_account_type
        ? t.accountNumberPrompt(t.accountTypeLabel[answers.selected_account_type])
        : t.accountTypePrompt
    case "otp":
      return t.invalidCodeFormat
    case "store_name":
      return session.registered_name
        ? t.verified(session.registered_name, toTitleCase(session.registered_name))
        : t.invalidStoreName
    case "category":
      return t.categoryPrompt
    case "products":
      return t.productsPrompt(MAX_ONBOARDING_PRODUCTS)
    case "review":
      return reviewMessage(t, session, answers)
    default:
      return t.accountTypePrompt
  }
}

function reviewMessage(
  t: OnboardingMessages,
  session: Omit<SessionView, "step" | "registered_name">,
  answers: OnboardingAnswers
) {
  return t.review({
    store_name: answers.store_name ?? "",
    category: answers.category ?? "other",
    account_type: session.account_type ?? "till",
    account_number: session.account_number ?? "",
    products: answers.products ?? [],
  })
}
