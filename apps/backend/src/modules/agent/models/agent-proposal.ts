import { model } from "@medusajs/framework/utils"

import AgentSession from "./agent-session"

// A change an agent suggested. The agent can't apply it: the member approves
// it in the chat, which calls the same merchant route the dashboard uses.
// message_id links it to the reply it appeared in once that reply is saved.
const AgentProposal = model
  .define("agent_proposal", {
    id: model.id({ prefix: "agprop" }).primaryKey(),
    session: model.belongsTo(() => AgentSession, {
      mappedBy: "proposals",
    }),
    message_id: model.text().nullable(),
    action: model.text(),
    args: model.json(),
    preview: model.json(),
    summary: model.text(),
    status: model
      .enum(["pending", "approved", "dismissed", "failed"])
      .default("pending"),
    error: model.text().nullable(),
    resolved_by_id: model.text().nullable(),
    resolved_at: model.dateTime().nullable(),
  })
  .indexes([
    {
      name: "IDX_agent_proposal_message_id",
      on: ["message_id"],
      where: "deleted_at IS NULL",
    },
  ])

export default AgentProposal
