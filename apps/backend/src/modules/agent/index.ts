import { Module } from "@medusajs/framework/utils"

import AgentModuleService from "./service"

export const AGENT_MODULE = "agent"

export default Module(AGENT_MODULE, {
  service: AgentModuleService,
})
