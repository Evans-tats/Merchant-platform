import { model } from "@medusajs/framework/utils"

import AgentSession from "./agent-session"

const AgentMessage = model.define("agent_message", {
  id: model.id({ prefix: "agmsg" }).primaryKey(),
  session: model.belongsTo(() => AgentSession, {
    mappedBy: "messages",
  }),
  role: model.enum(["user", "assistant"]),
  content: model.text(),
})

export default AgentMessage
