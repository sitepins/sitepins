import { z } from "zod";
import { AGENT_SCOPES, EAgentScope, EAgentWriteMode } from "./agent.type";

const id = z.string().min(1).max(100);

export const tokenGrantSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    expires_in_days: z.number().int().min(1).max(90),
    org_id: id,
    all_projects: z.boolean().default(false),
    project_ids: z.array(id).max(200).default([]),
    scopes: z
      .array(z.enum(AGENT_SCOPES as [EAgentScope, ...EAgentScope[]]))
      .min(1),
    write_mode: z.enum(EAgentWriteMode).default(EAgentWriteMode.DIRECT),
  })
  .refine((v) => v.all_projects || v.project_ids.length > 0, {
    message: "Pick at least one site",
    path: ["project_ids"],
  });
