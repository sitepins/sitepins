import ApiError from "@/errors/ApiError";
import { GitEngineError } from "@/lib/git-engine/errors";
import { z } from "zod";
import { measureTool } from "./agent.metrics";
import { EAgentScope, TAgentContext } from "./agent.type";

export type TToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

export type TToolRunner = (
  tool: string,
  fn: () => Promise<unknown>,
) => Promise<TToolResult>;

const result = (value: unknown, isError = false): TToolResult => ({
  content: [
    {
      type: "text",
      text: typeof value === "string" ? value : JSON.stringify(value),
    },
  ],
  ...(isError && { isError }),
});

export const toolFailure = (error: unknown): TToolResult => {
  if (error instanceof ApiError || error instanceof GitEngineError) {
    const extra = error as { violations?: unknown; code?: unknown };
    return result(
      { error: error.message, code: extra.code, violations: extra.violations },
      true,
    );
  }
  if (error instanceof z.ZodError) {
    return result(`Invalid input: ${error.message}`, true);
  }
  // Same rule as the HTTP error handler: plain Errors carry user-facing text.
  if (error instanceof Error && error.name === "Error") {
    return result({ error: error.message }, true);
  }
  return result("The tool failed unexpectedly.", true);
};

export const createToolRunner =
  (agent: TAgentContext): TToolRunner =>
  (tool, fn) =>
    measureTool(
      tool,
      agent.grant.grant_id,
      async () => {
        try {
          return result(await fn());
        } catch (error) {
          return toolFailure(error);
        }
      },
      (r) => r.content[0]?.text.length ?? 0,
    );

const WRITE_SCOPES = [
  EAgentScope.CONTENT_WRITE,
  EAgentScope.MEDIA_WRITE,
  EAgentScope.SCHEMA_WRITE,
  EAgentScope.CODE_WRITE,
];

export const canWrite = (agent: TAgentContext) =>
  WRITE_SCOPES.some((s) => agent.scopes.has(s));
