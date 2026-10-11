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

type TJsonObject = Record<string, unknown>;

// Keys some clients' function-calling APIs (notably Gemini) reject; the server still validates with zod.
const DROPPED_KEYS = new Set([
  "$schema",
  "default",
  "additionalProperties",
  "propertyNames",
  "pattern",
]);
const PORTABLE_FORMATS = new Set(["date-time", "enum"]);

/** The JSON Schema subset every MCP client accepts: no $schema, no type arrays (nullable instead), no exotic formats. */
export const toPortableJsonSchema = (node: unknown): unknown => {
  if (Array.isArray(node)) return node.map(toPortableJsonSchema);
  if (!node || typeof node !== "object") return node;
  const out: TJsonObject = {};
  for (const [key, value] of Object.entries(node as TJsonObject)) {
    if (DROPPED_KEYS.has(key)) continue;
    if (key === "format" && !PORTABLE_FORMATS.has(String(value))) continue;
    out[key] =
      key === "properties" && value && typeof value === "object"
        ? Object.fromEntries(
            Object.entries(value as TJsonObject).map(([name, schema]) => [
              name,
              toPortableJsonSchema(schema),
            ]),
          )
        : toPortableJsonSchema(value);
  }
  if (Array.isArray(out.type)) {
    const types = out.type.filter((t) => t !== "null");
    if (types.length < out.type.length) out.nullable = true;
    out.type = types.length === 1 ? types[0] : types;
  }
  return out;
};

type TStandardJsonSchema = {
  "~standard": {
    jsonSchema?: Record<"input" | "output", (options: unknown) => unknown>;
  };
};

/** Same schema and validation, advertised to clients as portable JSON Schema. */
export const portableSchema = <S extends TStandardJsonSchema>(schema: S): S => {
  const standard = schema["~standard"];
  const { jsonSchema } = standard;
  if (!jsonSchema) return schema;
  return {
    "~standard": {
      ...standard,
      jsonSchema: {
        input: (options: unknown) =>
          toPortableJsonSchema(jsonSchema.input(options)),
        output: (options: unknown) =>
          toPortableJsonSchema(jsonSchema.output(options)),
      },
    },
  } as unknown as S;
};
