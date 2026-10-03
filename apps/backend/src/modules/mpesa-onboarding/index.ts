import { Module } from "@medusajs/framework/utils"

import MpesaOnboardingModuleService from "./service"

export const MPESA_ONBOARDING_MODULE = "mpesaOnboarding"

export default Module(MPESA_ONBOARDING_MODULE, {
  service: MpesaOnboardingModuleService,
})
