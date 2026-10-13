import { EAgentScope, TAgentContext } from "@/modules/agent/agent.type";
import type { z } from "zod";

export { EAgentScope };
export type { TAgentContext };

export type TAgentToolAnnotations = {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
};

export type TAgentToolDefinition<S extends z.ZodObject = z.ZodObject> = {
  name: string;
  description: string;
  scope: EAgentScope;
  inputSchema?: S;
  annotations?: TAgentToolAnnotations;
  guide?: string;
  handler: (agent: TAgentContext, input: z.infer<S>) => Promise<unknown>;
};

const extraTools: TAgentToolDefinition[] = [];

/** Typed helper so the handler's input matches its schema. */
export const defineAgentTool = <S extends z.ZodObject>(
  tool: TAgentToolDefinition<S>,
) => tool as unknown as TAgentToolDefinition;

/** Adds MCP tools beside core's. Names must not clash with core tools. */
export const registerAgentTools = (...tools: TAgentToolDefinition[]) => {
  for (const tool of tools) {
    if (extraTools.some((t) => t.name === tool.name)) {
      throw new Error(`Agent tool ${tool.name} is already registered`);
    }
    extraTools.push(tool);
  }
};

export const getRegisteredAgentTools = (): readonly TAgentToolDefinition[] =>
  extraTools;
