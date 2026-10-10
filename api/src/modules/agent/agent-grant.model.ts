import mongoose, { model } from "mongoose";
import { AGENT_SCOPES, EAgentWriteMode, TAgentGrant } from "./agent.type";

const agentGrantSchema = new mongoose.Schema<TAgentGrant>(
  {
    grant_id: { type: String, required: true, unique: true },
    user_id: { type: String, required: true, index: true },
    token_index: { type: String, required: true, unique: true },
    token_hint: { type: String, required: true },
    name: { type: String, required: true },
    org_id: { type: String, required: true },
    project_ids: { type: [String], default: [] },
    all_projects: { type: Boolean, default: false },
    scopes: { type: [String], enum: AGENT_SCOPES, default: [] },
    write_mode: {
      type: String,
      enum: Object.values(EAgentWriteMode),
      default: EAgentWriteMode.DIRECT,
    },
    expires_at: { type: Date, required: true },
    last_used_at: { type: Date },
  },
  { timestamps: true },
);

// MongoDB removes tokens once they expire; revoking deletes them right away.
agentGrantSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

export const AgentGrant = model<TAgentGrant>("agent_grant", agentGrantSchema);
