import { Module } from "@medusajs/framework/utils"

import MpesaRegistryModuleService from "./service"

export const MPESA_REGISTRY_MODULE = "mpesaRegistry"

export default Module(MPESA_REGISTRY_MODULE, {
  service: MpesaRegistryModuleService,
})
