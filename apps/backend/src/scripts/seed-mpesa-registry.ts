import type { ExecArgs } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils"

import { MPESA_REGISTRY_MODULE } from "../modules/mpesa-registry"
import MpesaRegistryModuleService, {
  type MpesaAccountType,
} from "../modules/mpesa-registry/service"
import { maskMsisdn, normalizeMsisdn } from "../services/mpesa-onboarding/parsing"

type MockAccount = {
  account_type: MpesaAccountType
  account_number: string
  registered_name: string
  owner_msisdn: string
  kyc_status: "verified" | "pending" | "suspended"
}

const mockAccounts: MockAccount[] = [
  {
    account_type: "till",
    account_number: "5123456",
    registered_name: "MAMA NJERI GROCERIES",
    owner_msisdn: "254712345678",
    kyc_status: "verified",
  },
  {
    account_type: "paybill",
    account_number: "4012345",
    registered_name: "KAMAU HARDWARE LIMITED",
    owner_msisdn: "254722000111",
    kyc_status: "verified",
  },
  {
    account_type: "paybill",
    account_number: "4056789",
    registered_name: "HIBY HEAVEN",
    owner_msisdn: "254745678901",
    kyc_status: "verified",
  },
  {
    account_type: "till",
    account_number: "5234567",
    registered_name: "ACHIENG BEAUTY PARLOUR",
    owner_msisdn: "254711222333",
    kyc_status: "verified",
  },
  {
    account_type: "pochi",
    account_number: "254733444555",
    registered_name: "WANJIKU FASHION HOUSE",
    owner_msisdn: "254733444555",
    kyc_status: "verified",
  },
  {
    account_type: "till",
    account_number: "5999999",
    registered_name: "PENDING KYC SHOP",
    owner_msisdn: "254700999999",
    kyc_status: "pending",
  },
]

// Usage: npm run seed:mpesa-registry [-- <your phone> "<business name>"]
// Passing a phone number also registers a Pochi la Biashara on it so you can
// test the Pochi journey from that number.
export default async function seedMpesaRegistry({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const registry = container.resolve<MpesaRegistryModuleService>(
    MPESA_REGISTRY_MODULE
  )
  const accounts = [...mockAccounts]
  const pochiMsisdn = args[0] ? normalizeMsisdn(args[0]) : null

  if (args[0] && !pochiMsisdn) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `${args[0]} is not a valid Kenyan phone number`
    )
  }

  if (pochiMsisdn) {
    accounts.push({
      account_type: "pochi",
      account_number: pochiMsisdn,
      registered_name: (args[1] || "DEMO POCHI BIASHARA").toUpperCase(),
      owner_msisdn: pochiMsisdn,
      kyc_status: "verified",
    })
  }

  for (const account of accounts) {
    const existing = await registry.findAccount(
      account.account_type,
      account.account_number
    )

    if (existing) {
      await registry.updateMpesaRegistryAccounts({ id: existing.id, ...account })
    } else {
      await registry.createMpesaRegistryAccounts(account)
    }
  }

  logger.info("Mock M-PESA registry is ready:")
  for (const account of accounts) {
    logger.info(
      `  ${account.account_type.padEnd(7)} ${account.account_number.padEnd(12)} ${account.registered_name} (owner ${maskMsisdn(account.owner_msisdn)}, ${account.kyc_status})`
    )
  }
}
