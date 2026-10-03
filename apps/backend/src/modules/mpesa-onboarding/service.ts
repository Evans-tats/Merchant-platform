import { MedusaService } from "@medusajs/framework/utils"

import MpesaAccountClaim from "./models/mpesa-account-claim"
import OnboardingSession from "./models/onboarding-session"

class MpesaOnboardingModuleService extends MedusaService({
  OnboardingSession,
  MpesaAccountClaim,
}) {}

export default MpesaOnboardingModuleService
