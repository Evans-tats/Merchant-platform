import { model } from "@medusajs/framework/utils"

import AgentMessage from "./agent-message"
import AgentProposal from "./agent-proposal"

// One conversation with an admin agent. Sessions belong to the merchant
// member who started them; agent_type tells the agents apart.
const AgentSession = model
  .define("agent_session", {
    id: model.id({ prefix: "agsess" }).primaryKey(),
    agent_type: model.text(),
    merchant_id: model.text(),
    created_by_id: model.text(),
    title: model.text().nullable(),
    messages: model.hasMany(() => AgentMessage, {
      mappedBy: "session",
    }),
    proposals: model.hasMany(() => AgentProposal, {
      mappedBy: "session",
    }),
  })
  .indexes([
    {
      name: "IDX_agent_session_owner",
      on: ["merchant_id", "created_by_id", "agent_type"],
      where: "deleted_at IS NULL",
    },
  ])
  .cascades({
    delete: ["messages", "proposals"],
  })

export default AgentSession
