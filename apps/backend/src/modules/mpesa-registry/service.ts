import { MedusaService } from "@medusajs/framework/utils"

import MpesaRegistryAccount from "./models/mpesa-registry-account"

export type MpesaAccountType = "till" | "paybill" | "pochi"

class MpesaRegistryModuleService extends MedusaService({
  MpesaRegistryAccount,
}) {
  // The only lookup the rest of the platform relies on. A real registry
  // client replaces this module by exposing the same method.
  async findAccount(accountType: MpesaAccountType, accountNumber: string) {
    const [account] = await this.listMpesaRegistryAccounts(
      { account_type: accountType, account_number: accountNumber },
      { take: 1 }
    )

    return account ?? null
  }
}

export default MpesaRegistryModuleService
