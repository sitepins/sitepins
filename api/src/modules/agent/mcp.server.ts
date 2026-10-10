import config from "@/config/variables";
import ApiError from "@/errors/ApiError";
import { TChangesetChange } from "@/lib/git-engine/changeset";
import { GitEngineError } from "@/lib/git-engine/errors";
import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import * as service from "./agent.service";
import { EAgentScope, TAgentContext } from "./agent.type";

type TToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
};

const MAX_CONFLICT_PREVIEW = 20_000;

const text = (value: unknown): TToolResult => {
  const body =
    typeof value === "string" ? value : JSON.stringify(value, null, 2);
  const structured =
    value !== null && typeof value === "object" && !Array.isArray(value)
      ? { structuredContent: value as Record<string, unknown> }
      : {};
  return { content: [{ type: "text", text: body }], ...structured };
};

const failure = (error: unknown): TToolResult => {
  if (error instanceof ApiError || error instanceof GitEngineError) {
    const extra = error as { violations?: unknown; code?: unknown };
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              error: error.message,
              code: extra.code,
              violations: extra.violations,
            },
            null,
            2,
          ),
        },
      ],
    };
  }
  if (error instanceof z.ZodError) {
    return {
      isError: true,
      content: [{ type: "text", text: `Invalid input: ${error.message}` }],
    };
  }
  return {
    isError: true,
    content: [{ type: "text", text: "The tool failed unexpectedly." }],
  };
};

const run = async (fn: () => Promise<unknown>): Promise<TToolResult> => {
  try {
    return text(await fn());
  } catch (error) {
    return failure(error);
  }
};

const projectId = z.string().describe("Project id from list_projects");

const fileInput = z.object({
  path: z
    .string()
    .describe("Repository-relative path, e.g. src/content/blog/hello.md"),
  content: z.string().optional().describe("New UTF-8 text content"),
  content_base64: z
    .string()
    .optional()
    .describe("New binary content (images, PDFs) as base64"),
  expected_sha: z
    .string()
    .nullable()
    .optional()
    .describe(
      "Blob sha from read_file for an existing file; null for a new file",
    ),
});

const describeConflicts = (
  result: Awaited<ReturnType<typeof service.applyAgentChangeset>>,
) => {
  if (result.status !== "conflict") return result;
  return {
    ...result,
    conflicts: result.conflicts.map((c) => {
      const content = c.remoteContentBase64
        ? Buffer.from(c.remoteContentBase64, "base64").toString("utf-8")
        : null;
      return {
        path: c.path,
        remote_sha: c.remoteSha,
        remote_content:
          content && content.length > MAX_CONFLICT_PREVIEW
            ? `${content.slice(0, MAX_CONFLICT_PREVIEW)}\n…(truncated)`
            : content,
      };
    }),
    hint: "Someone changed these files. Re-read them, merge your edit, and retry with the new expected_sha.",
  };
};

/** One server per request, bound to the already-verified agent. */
export const buildMcpServer = (agent: TAgentContext): McpServer => {
  const server = new McpServer(
    { name: "sitepins", version: "1.0.0" },
    {
      instructions:
        "Sitepins is a Git-based CMS. Start with list_projects, then get_project_context to learn the site's folders, schemas and what you may write. All writes go through write_files or move_file and are committed by the Sitepins bot. If you can run shell commands, use get_clone_command to clone the site locally for full context and testing; never use git push.",
    },
  );

  server.registerTool(
    "list_projects",
    {
      description: "Projects (sites) this agent may access.",
      annotations: { readOnlyHint: true },
    },
    () =>
      run(() => service.listProjects(agent).then((projects) => ({ projects }))),
  );

  server.registerTool(
    "get_project_context",
    {
      description:
        "Everything needed to edit a site: framework, content/media folders, schemas with fields, content layout, writable paths, dev command and head commit.",
      inputSchema: z.object({ project_id: projectId }),
      annotations: { readOnlyHint: true },
    },
    ({ project_id }) => run(() => service.getProjectContext(agent, project_id)),
  );

  server.registerTool(
    "list_files",
    {
      description:
        "List files under a folder (recursive) at the head or a given commit.",
      inputSchema: z.object({
        project_id: projectId,
        path: z
          .string()
          .optional()
          .describe("Folder; omit for the whole repository"),
        ref: z
          .string()
          .optional()
          .describe("Commit sha or branch; defaults to the project branch"),
      }),
      annotations: { readOnlyHint: true },
    },
    ({ project_id, path, ref }) =>
      run(() => service.listFiles(agent, project_id, { path, ref })),
  );

  server.registerTool(
    "read_file",
    {
      description:
        "Read a file. Returns its blob sha; pass it as expected_sha when you write the file back. Use ref to read an older version.",
      inputSchema: z.object({
        project_id: projectId,
        path: z.string(),
        ref: z.string().optional(),
      }),
      annotations: { readOnlyHint: true },
    },
    ({ project_id, path, ref }) =>
      run(() => service.readFile(agent, project_id, { path, ref })),
  );

  server.registerTool(
    "list_history",
    {
      description:
        "Recent commits on the project branch, optionally for one file.",
      inputSchema: z.object({
        project_id: projectId,
        path: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional(),
      }),
      annotations: { readOnlyHint: true },
    },
    ({ project_id, path, limit }) =>
      run(() =>
        service
          .listHistory(agent, project_id, { path, limit })
          .then((commits) => ({ commits })),
      ),
  );

  server.registerTool(
    "get_clone_command",
    {
      description:
        "Shell commands to clone the site locally (read-only) and to pull updates, for agents that can run git. Edit files locally, then save them with write_files, passing the cloned commit as base_commit.",
      inputSchema: z.object({ project_id: projectId }),
      annotations: { readOnlyHint: true },
    },
    ({ project_id }) =>
      run(async () => {
        const project = await service.resolveProject(
          agent,
          project_id,
          EAgentScope.CONTENT_READ,
        );
        if (!config.base_url) {
          throw new ApiError("This server has no BASE_URL configured", 500, "");
        }
        // The header comes from the environment so the token never lands in .git/config.
        const auth =
          'GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=http.extraHeader GIT_CONFIG_VALUE_0="Authorization: Bearer $SITEPINS_TOKEN"';
        const dir = project.project_name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-");
        return {
          setup:
            "Set SITEPINS_TOKEN to the same Sitepins access token your MCP configuration uses.",
          clone: `${auth} git clone --branch ${project.branch} ${config.base_url}/git/${project.project_id}.git ${dir}`,
          pull: `${auth} git pull`,
          base_commit: "git rev-parse HEAD",
          save: "Send changed files with write_files and base_commit set to the commit you cloned or last pulled. git push is refused.",
        };
      }),
  );

  server.registerTool(
    "write_files",
    {
      description:
        "Create, update and delete files in ONE commit made by the Sitepins bot. Every edited or deleted file needs expected_sha from read_file (null for new files), unless you pass base_commit. Use dry_run to preview. If someone else changed a file, you get its current content back instead of a commit.",
      inputSchema: z.object({
        project_id: projectId,
        message: z.string().min(1).max(500).describe("Commit message"),
        description: z.string().max(10_000).optional(),
        files: z.array(fileInput).max(100).default([]),
        deletes: z
          .array(
            z.object({ path: z.string(), expected_sha: z.string().optional() }),
          )
          .max(100)
          .default([]),
        base_commit: z
          .string()
          .optional()
          .describe("Head commit your edits are based on"),
        dry_run: z.boolean().optional(),
        branch: z
          .string()
          .optional()
          .describe("Commit to this branch instead (needs git:branch)"),
        open_pr: z
          .boolean()
          .optional()
          .describe("Open a pull request from the branch"),
      }),
      annotations: { destructiveHint: true, idempotentHint: false },
    },
    (input) =>
      run(async () => {
        const changes: TChangesetChange[] = [];
        const expected: Record<string, string | null> = {};
        for (const file of input.files) {
          if (
            (file.content === undefined) ===
            (file.content_base64 === undefined)
          ) {
            throw new ApiError(
              `${file.path}: pass exactly one of content or content_base64`,
              400,
              "",
            );
          }
          if (!input.base_commit && file.expected_sha === undefined) {
            throw new ApiError(
              `${file.path}: pass expected_sha from read_file (null for a new file) or base_commit`,
              400,
              "",
            );
          }
          if (file.expected_sha !== undefined)
            expected[file.path] = file.expected_sha;
          changes.push({
            op: "upsert",
            path: file.path,
            content:
              file.content !== undefined
                ? Buffer.from(file.content, "utf-8")
                : Buffer.from(file.content_base64!, "base64"),
          });
        }
        for (const del of input.deletes) {
          if (!input.base_commit && !del.expected_sha) {
            throw new ApiError(
              `${del.path}: pass expected_sha from read_file or base_commit`,
              400,
              "",
            );
          }
          if (del.expected_sha) expected[del.path] = del.expected_sha;
          changes.push({ op: "delete", path: del.path });
        }
        if (!changes.length) throw new ApiError("Nothing to write", 400, "");
        const result = await service.applyAgentChangeset(
          agent,
          input.project_id,
          {
            message: input.message,
            description: input.description,
            base_commit: input.base_commit,
            expected_shas: Object.keys(expected).length ? expected : undefined,
            dry_run: input.dry_run,
            branch: input.branch,
            open_pr: input.open_pr,
            changes,
          },
        );
        return describeConflicts(result);
      }),
  );

  server.registerTool(
    "move_file",
    {
      description:
        "Rename or move a file in one commit made by the Sitepins bot.",
      inputSchema: z.object({
        project_id: projectId,
        from: z.string(),
        to: z.string(),
        expected_sha: z.string().describe("Blob sha of `from` from read_file"),
        message: z.string().min(1).max(500),
      }),
      annotations: { destructiveHint: true },
    },
    ({ project_id, from, to, expected_sha, message }) =>
      run(async () =>
        describeConflicts(
          await service.applyAgentChangeset(agent, project_id, {
            message,
            expected_shas: { [from]: expected_sha, [to]: null },
            changes: [{ op: "rename", from, path: to }],
          }),
        ),
      ),
  );

  return server;
};
