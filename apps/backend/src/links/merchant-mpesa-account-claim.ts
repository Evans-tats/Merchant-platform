import { defineLink } from "@medusajs/framework/utils"

import MerchantModule from "../modules/merchant"
import MpesaOnboardingModule from "../modules/mpesa-onboarding"

export default defineLink(
  MerchantModule.linkable.merchant,
  MpesaOnboardingModule.linkable.mpesaAccountClaim,
  {
    database: {
      table: "merchant_mpesa_account_claim",
      idPrefix: "mermpc",
    },
  }
)
