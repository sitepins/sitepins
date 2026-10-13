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

/** Every tool error carries one of these, so agents can branch on it and metrics can count it. */
export enum EToolErrorCode {
  NOT_FOUND = "not_found",
  NO_MATCH = "no_match",
  AMBIGUOUS = "ambiguous",
  CONFLICT = "conflict",
  PERMISSION = "permission",
  INVALID_INPUT = "invalid_input",
  INVALID_FIELDS = "invalid_fields",
  UNKNOWN_FIELD = "unknown_field",
  EXISTS = "exists",
  RATE_LIMITED = "rate_limited",
  READ_ONLY = "read_only",
  ARCHIVED = "archived",
  UNAVAILABLE = "unavailable",
}

const CODES = new Set<string>(Object.values(EToolErrorCode));

const GIT_ENGINE_CODES: Record<string, EToolErrorCode> = {
  ref_moved: EToolErrorCode.CONFLICT,
  diverged: EToolErrorCode.CONFLICT,
  busy: EToolErrorCode.CONFLICT,
  not_found: EToolErrorCode.NOT_FOUND,
  too_large: EToolErrorCode.INVALID_INPUT,
  invalid: EToolErrorCode.INVALID_INPUT,
  unsupported: EToolErrorCode.INVALID_INPUT,
  policy: EToolErrorCode.PERMISSION,
  forbidden: EToolErrorCode.PERMISSION,
  upstream: EToolErrorCode.UNAVAILABLE,
};

const codeForStatus = (status: number) => {
  if (status === 401 || status === 403) return EToolErrorCode.PERMISSION;
  if (status === 404) return EToolErrorCode.NOT_FOUND;
  if (status === 409) return EToolErrorCode.CONFLICT;
  if (status === 429) return EToolErrorCode.RATE_LIMITED;
  if (status >= 400 && status < 500) return EToolErrorCode.INVALID_INPUT;
  return EToolErrorCode.UNAVAILABLE;
};

type TToolErrorExtra = { fix?: string; details?: Record<string, unknown> };

/** An ApiError the tool layer reports as `{ error, code, fix?, ...details }`. */
export const agentError = (
  message: string,
  status: number,
  code: EToolErrorCode,
  extra: TToolErrorExtra = {},
) => Object.assign(new ApiError(message, status, ""), { code, ...extra });

export const errorCodeOf = (error: unknown): EToolErrorCode => {
  const raw = (error as { code?: unknown })?.code;
  if (typeof raw === "string" && CODES.has(raw)) return raw as EToolErrorCode;
  if (typeof raw === "string" && GIT_ENGINE_CODES[raw]) {
    return GIT_ENGINE_CODES[raw];
  }
  if (error instanceof ApiError) return codeForStatus(error.statusCode);
  if (error instanceof GitEngineError) return codeForStatus(error.status);
  if (error instanceof z.ZodError) return EToolErrorCode.INVALID_INPUT;
  if (error instanceof Error && error.name === "Error") {
    return EToolErrorCode.INVALID_INPUT;
  }
  return EToolErrorCode.UNAVAILABLE;
};

type TIssue = { path?: readonly unknown[]; message: string };

const issuePath = (issue: TIssue) =>
  (issue.path ?? [])
    .map((p) =>
      typeof p === "object" && p ? String((p as { key: unknown }).key) : p,
    )
    .join(".");

/** Names the bad field instead of dumping the validator's report. */
export const invalidInput = (issues: readonly TIssue[]) => {
  const first = issues[0];
  const field = first ? issuePath(first) : "";
  return {
    error: `Invalid input${field ? ` in ${field}` : ""}: ${first?.message ?? "check the arguments"}`,
    code: EToolErrorCode.INVALID_INPUT,
    fix: field
      ? `Fix ${field} (see the tool's input schema) and call again.`
      : "Check the arguments against the tool's input schema and call again.",
  };
};

export const toolFailure = (error: unknown): TToolResult => {
  const code = errorCodeOf(error);
  if (error instanceof ApiError || error instanceof GitEngineError) {
    const extra = error as TToolErrorExtra & { violations?: unknown };
    return result(
      {
        error: error.message,
        code,
        ...(extra.fix && { fix: extra.fix }),
        ...(extra.violations !== undefined && {
          violations: extra.violations,
        }),
        ...extra.details,
      },
      true,
    );
  }
  if (error instanceof z.ZodError) {
    return result(invalidInput(error.issues), true);
  }
  // Same rule as the HTTP error handler: plain Errors carry user-facing text.
  if (error instanceof Error && error.name === "Error") {
    return result({ error: error.message, code }, true);
  }
  return result({ error: "The tool failed unexpectedly.", code }, true);
};

export const createToolRunner =
  (agent: TAgentContext): TToolRunner =>
  (tool, fn) =>
    measureTool(
      tool,
      agent.grant.grant_id,
      async () => {
        try {
          return { value: result(await fn()) };
        } catch (error) {
          return { value: toolFailure(error), code: errorCodeOf(error) };
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
