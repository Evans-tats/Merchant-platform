import { createInterface } from "node:readline/promises"

import type { ExecArgs } from "@medusajs/framework/types"

import { handleOnboardingMessage } from "../services/mpesa-onboarding/conversation"
import { normalizeMsisdn } from "../services/mpesa-onboarding/parsing"

// Interactive stand-in for the WhatsApp (Zuri) conversation. It sends each
// line to the same engine a messaging webhook will use.
// Usage: npm run onboard:mpesa [-- <phone number>]
export default async function mpesaOnboardingCli({ container, args }: ExecArgs) {
  const terminal = createInterface({ input: process.stdin })
  // Reading through the iterator (rather than question()) keeps every line
  // when input is piped in, which lets the flow be scripted for demos.
  const lines = terminal[Symbol.asyncIterator]()
  const ask = async (prompt: string) => {
    process.stdout.write(prompt)
    const { value, done } = await lines.next()
    return done ? null : String(value)
  }
  const print = (messages: string[]) => {
    for (const message of messages) {
      process.stdout.write(`\nAgent: ${message.replace(/\n/g, "\n       ")}\n`)
    }
  }

  try {
    process.stdout.write(
      "\nM-PESA Online Store onboarding (CLI simulation)\n" +
        "Verification codes appear as [SIMULATED SMS] log lines.\n" +
        "Type /quit to leave. Your progress is saved.\n\n"
    )

    let msisdn = args[0] ? normalizeMsisdn(args[0]) : null
    while (!msisdn) {
      const answer = await ask(
        "Your phone number (stands in for the WhatsApp number): "
      )
      if (answer === null) {
        return
      }
      msisdn = normalizeMsisdn(answer)
      if (!msisdn) {
        process.stdout.write("Enter a Kenyan number such as 0712345678.\n")
      }
    }

    let reply = await handleOnboardingMessage(container, {
      msisdn,
      channel: "cli",
      text: "",
    })
    print(reply.messages)

    while (!reply.done) {
      const text = await ask("\nYou: ")
      if (text === null || text.trim() === "/quit") {
        break
      }
      if (!process.stdin.isTTY) {
        process.stdout.write(`${text}\n`)
      }

      try {
        reply = await handleOnboardingMessage(container, {
          msisdn,
          channel: "cli",
          text,
        })
        print(reply.messages)
      } catch (error) {
        print([
          `Something went wrong: ${error instanceof Error ? error.message : String(error)}`,
        ])
      }
    }
  } finally {
    terminal.close()
  }
}
