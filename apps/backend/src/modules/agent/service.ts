import { MedusaService } from "@medusajs/framework/utils"

import AgentMessage from "./models/agent-message"
import AgentSession from "./models/agent-session"

// Conversation storage shared by every admin agent. The agent runtime lives
// in src/services/store-assistant so it can run merchant-scoped workflows.
class AgentModuleService extends MedusaService({
  AgentSession,
  AgentMessage,
}) {}

export default AgentModuleService
