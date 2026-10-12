import brand from "@/config/brand";
import ApiError from "@/errors/ApiError";
import { getRegisteredAgentTools } from "@/lib/agentExtensions";
import { TChangesetChange } from "@/lib/git-engine/changeset";
import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import * as org from "./agent.org";
import * as service from "./agent.service";
import { canWrite, createToolRunner, portableSchema } from "./agent.tools";
import { EAgentScope, EContextPart, TAgentContext } from "./agent.type";

const MAX_CONFLICT_PREVIEW = 20_000;

// Sent once per session, so every sentence has to earn its place.
const INSTRUCTIONS = [
  `${brand.name} edits websites stored in Git. Users are usually not developers ("make the banner red", "save my changes"): map their words to these tools and reply in plain language, no git jargon.`,
  "Start: list_projects (ask which site if unclear), then get_project_context once; its where_to_edit points to settings, styles and templates.",
  "Find with search_content using the user's words, read with read_files. Change text with edit_file, frontmatter or settings values with update_fields, add posts or pages with create_entry, images with create_upload_url, anything else with write_files.",
  "Every write is saved and published to the repository at once; there is no save or push step. In pull_request write mode, share the pull request link: it goes live after merging.",
  'Use commit messages a non-developer understands. Confirm risky or ambiguous changes first, or use dry_run. "Undo that": undo_change with no commit_sha undoes your last change. "Is it live?": get_deploy_status.',
  "If a tool reports a missing permission, tell the user the setting it names. Local clones: get_clone_command (pass local_head to sync), run its command as given, never store tokens or git push.",
].join(" ");

const projectId = z.string().describe("From list_projects");
const ref = z.string().optional().describe("Commit or branch; default: latest");
const message = z.string().min(1).max(500).describe("Commit message");

const dryRun = z.boolean().optional().describe("Preview without committing");

const fileInput = z.object({
  path: z.string(),
  content: z.string().optional().describe("UTF-8 text"),
  content_base64: z.string().optional().describe("Binary, base64"),
  expected_sha: z
    .string()
    .nullable()
    .optional()
    .describe("sha from read_files; null for a new file"),
});

const memberRole = z.enum(["admin", "editor"]);

// A list, not a free-form object: Gemini rejects object schemas without properties.
const fieldValues = z
  .array(
    z.object({
      field: z.string().min(1).describe('Dots for nesting: "banner.title"'),
      value: z.string().optional().describe("Text value"),
      value_json: z
        .string()
        .optional()
        .describe('Number, true/false, list or object as JSON: 3, true, ["a"]'),
    }),
  )
  .max(50);

const toFieldMap = (entries: z.infer<typeof fieldValues> = []) => {
  const map: Record<string, unknown> = {};
  for (const entry of entries) {
    if ((entry.value === undefined) === (entry.value_json === undefined)) {
      throw new ApiError(
        `${entry.field}: pass exactly one of value or value_json`,
        400,
        "",
      );
    }
    if (entry.value !== undefined) {
      map[entry.field] = entry.value;
      continue;
    }
    try {
      map[entry.field] = JSON.parse(entry.value_json!);
    } catch {
      throw new ApiError(
        `${entry.field}: value_json isn't valid JSON`,
        400,
        "",
      );
    }
  }
  return map;
};

const describeConflicts = <
  T extends Awaited<ReturnType<typeof service.applyAgentChangeset>>,
>(
  result: T,
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

/** One server per request, bound to the already-verified agent. Tools the token can't use aren't listed. */
export const buildMcpServer = (agent: TAgentContext): McpServer => {
  const server = new McpServer(
    { name: brand.slug, version: "1.2.0" },
    { instructions: INSTRUCTIONS },
  );
  const run = createToolRunner(agent);
  // Every tool, core or extension, advertises portable JSON Schema (see portableSchema).
  const registerTool = server.registerTool.bind(server);
  server.registerTool = ((
    name: string,
    config: { inputSchema?: Parameters<typeof portableSchema>[0] },
    cb: unknown,
  ) =>
    registerTool(
      name,
      (config.inputSchema
        ? { ...config, inputSchema: portableSchema(config.inputSchema) }
        : config) as never,
      cb as never,
    )) as typeof server.registerTool;
  const has = (scope: EAgentScope) => agent.scopes.has(scope);
  const readOnly = { readOnlyHint: true };
  const destructive = { destructiveHint: true, idempotentHint: false };

  if (has(EAgentScope.PROJECTS_READ)) {
    server.registerTool(
      "list_projects",
      { description: "Sites this token can access.", annotations: readOnly },
      () =>
        run("list_projects", () =>
          service.listProjects(agent).then((projects) => ({ projects })),
        ),
    );
  }

  if (has(EAgentScope.CONTENT_READ)) {
    server.registerTool(
      "get_project_context",
      {
        description:
          "Site summary: framework, content/media folders, schemas, where_to_edit, permissions, head commit.",
        inputSchema: z.object({
          project_id: projectId,
          include: z
            .array(z.enum(EContextPart))
            .optional()
            .describe(
              "Extra detail: schema fields, all folders, samples, config",
            ),
        }),
        annotations: readOnly,
      },
      ({ project_id, include }) =>
        run("get_project_context", () =>
          service.getProjectContext(agent, project_id, include),
        ),
    );

    server.registerTool(
      "get_schema",
      {
        description: "One content schema with all its fields.",
        inputSchema: z.object({
          project_id: projectId,
          name: z.string().describe("Schema name or path"),
        }),
        annotations: readOnly,
      },
      ({ project_id, name }) =>
        run("get_schema", () => service.getSchema(agent, project_id, name)),
    );

    server.registerTool(
      "list_files",
      {
        description: "File paths under a folder, sorted and paginated.",
        inputSchema: z.object({
          project_id: projectId,
          path: z.string().optional().describe("Folder; default: whole repo"),
          glob: z.string().optional().describe("e.g. **/*.md"),
          ref,
          limit: z.number().int().min(1).max(2000).optional(),
          cursor: z
            .string()
            .optional()
            .describe("next_cursor of the last page"),
          include_sha: z.boolean().optional(),
        }),
        annotations: readOnly,
      },
      ({ project_id, ...options }) =>
        run("list_files", () => service.listFiles(agent, project_id, options)),
    );

    server.registerTool(
      "read_files",
      {
        description:
          "Read 1–20 files. Each comes with its sha, the expected_sha for writing it back.",
        inputSchema: z.object({
          project_id: projectId,
          paths: z.array(z.string()).min(1).max(20),
          ref,
        }),
        annotations: readOnly,
      },
      ({ project_id, paths, ref }) =>
        run("read_files", () =>
          service.readFiles(agent, project_id, { paths, ref }),
        ),
    );

    server.registerTool(
      "search_content",
      {
        description:
          "Find text (substring) in content and in templates/styles/settings. Matches say if this token can edit them.",
        inputSchema: z.object({
          project_id: projectId,
          query: z.string().min(1).max(200),
          path: z.string().optional().describe("Search one folder only"),
          glob: z.string().optional(),
          case_sensitive: z.boolean().optional(),
          limit: z.number().int().min(1).max(200).optional(),
        }),
        annotations: readOnly,
      },
      ({ project_id, ...options }) =>
        run("search_content", () =>
          service.searchContent(agent, project_id, options),
        ),
    );

    server.registerTool(
      "list_history",
      {
        description: "Recent changes on the site, optionally for one file.",
        inputSchema: z.object({
          project_id: projectId,
          path: z.string().optional(),
          limit: z.number().int().min(1).max(100).optional(),
        }),
        annotations: readOnly,
      },
      ({ project_id, path, limit }) =>
        run("list_history", () =>
          service
            .listHistory(agent, project_id, { path, limit })
            .then((commits) => ({ commits })),
        ),
    );

    server.registerTool(
      "get_deploy_status",
      {
        description:
          "Is a change live? Build/deploy state from the host, with a plain summary.",
        inputSchema: z.object({
          project_id: projectId,
          commit_sha: z.string().optional().describe("Default: latest"),
        }),
        annotations: readOnly,
      },
      ({ project_id, commit_sha }) =>
        run("get_deploy_status", () =>
          service.getDeployStatus(agent, project_id, { commit_sha }),
        ),
    );

    server.registerTool(
      "get_clone_command",
      {
        description:
          "Clone or sync a local copy (needs a shell). With local_head it says if a sync is needed. Commands carry a 1-hour read-only key.",
        inputSchema: z.object({
          project_id: projectId,
          local_head: z.string().optional().describe("git rev-parse HEAD"),
        }),
        annotations: readOnly,
      },
      ({ project_id, local_head }) =>
        run("get_clone_command", () =>
          service.getGitCommands(agent, project_id, { local_head }),
        ),
    );
  }

  if (has(EAgentScope.CONTENT_READ) && canWrite(agent)) {
    server.registerTool(
      "edit_file",
      {
        description:
          "Find-and-replace in one text file. Each old_string must match once unless replace_all.",
        inputSchema: z.object({
          project_id: projectId,
          path: z.string(),
          edits: z
            .array(
              z.object({
                old_string: z.string().min(1),
                new_string: z.string(),
                replace_all: z.boolean().optional(),
              }),
            )
            .min(1)
            .max(50),
          message,
          expected_sha: z.string().optional(),
          dry_run: dryRun,
        }),
        annotations: destructive,
      },
      ({ project_id, ...input }) =>
        run("edit_file", async () =>
          describeConflicts(await service.editFile(agent, project_id, input)),
        ),
    );

    server.registerTool(
      "update_fields",
      {
        description:
          "Set or remove frontmatter fields of a content file, or values in a JSON/YAML/TOML settings file. Only those fields change.",
        inputSchema: z.object({
          project_id: projectId,
          path: z.string(),
          set: fieldValues.optional(),
          unset: z.array(z.string()).optional(),
          message,
          expected_sha: z.string().optional(),
          dry_run: dryRun,
        }),
        annotations: destructive,
      },
      ({ project_id, set, ...input }) =>
        run("update_fields", async () =>
          describeConflicts(
            await service.updateEntryFields(agent, project_id, {
              ...input,
              set: toFieldMap(set),
            }),
          ),
        ),
    );

    server.registerTool(
      "create_entry",
      {
        description:
          "Add a post/page in a content folder using its schema: defaults filled, fields checked, never overwrites.",
        inputSchema: z.object({
          project_id: projectId,
          folder: z.string().optional().describe("e.g. src/content/blog"),
          schema: z.string().optional().describe("Instead of folder"),
          title: z.string().optional(),
          slug: z.string().optional().describe("File name; default from title"),
          fields: fieldValues.optional(),
          body: z.string().optional().describe("Markdown body"),
          message: message.optional(),
          dry_run: dryRun,
        }),
        annotations: destructive,
      },
      ({ project_id, fields, ...input }) =>
        run("create_entry", () =>
          service.createEntry(agent, project_id, {
            ...input,
            fields: toFieldMap(fields),
          }),
        ),
    );

    server.registerTool(
      "create_upload_url",
      {
        description:
          "One-time link to upload a local file (image, PDF) with curl; the server commits it. Returns site_path to use in content.",
        inputSchema: z.object({
          project_id: projectId,
          path: z.string().describe("Destination, e.g. public/images/hero.jpg"),
          overwrite: z.boolean().optional(),
          message: message.optional(),
        }),
        annotations: destructive,
      },
      ({ project_id, ...input }) =>
        run("create_upload_url", () =>
          service.prepareUpload(agent, project_id, input),
        ),
    );

    server.registerTool(
      "write_files",
      {
        description:
          "Create, replace or delete files in one commit. Each existing file needs expected_sha (null when new) unless base_commit is given.",
        inputSchema: z.object({
          project_id: projectId,
          message,
          description: z.string().max(10_000).optional(),
          files: z.array(fileInput).max(100).default([]),
          deletes: z
            .array(
              z.object({
                path: z.string(),
                expected_sha: z.string().optional(),
              }),
            )
            .max(100)
            .default([]),
          base_commit: z.string().optional().describe("Clone's HEAD"),
          dry_run: dryRun,
          branch: z
            .string()
            .optional()
            .describe("Commit to this branch (git:branch)"),
          open_pr: z
            .boolean()
            .optional()
            .describe("Open a pull request from branch"),
        }),
        annotations: destructive,
      },
      (input) =>
        run("write_files", async () => {
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
                `${file.path}: pass expected_sha from read_files (null for a new file) or base_commit`,
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
                `${del.path}: pass expected_sha from read_files or base_commit`,
                400,
                "",
              );
            }
            if (del.expected_sha) expected[del.path] = del.expected_sha;
            changes.push({ op: "delete", path: del.path });
          }
          if (!changes.length) throw new ApiError("Nothing to write", 400, "");
          return describeConflicts(
            await service.applyAgentChangeset(agent, input.project_id, {
              message: input.message,
              description: input.description,
              base_commit: input.base_commit,
              expected_shas: Object.keys(expected).length
                ? expected
                : undefined,
              dry_run: input.dry_run,
              branch: input.branch,
              open_pr: input.open_pr,
              changes,
            }),
          );
        }),
    );

    server.registerTool(
      "move_file",
      {
        description: "Rename or move a file.",
        inputSchema: z.object({
          project_id: projectId,
          from: z.string(),
          to: z.string(),
          expected_sha: z.string().describe("sha of from"),
          message,
        }),
        annotations: { destructiveHint: true },
      },
      ({ project_id, from, to, expected_sha, message }) =>
        run("move_file", async () =>
          describeConflicts(
            await service.applyAgentChangeset(agent, project_id, {
              message,
              expected_shas: { [from]: expected_sha, [to]: null },
              changes: [{ op: "rename", from, path: to }],
            }),
          ),
        ),
    );

    server.registerTool(
      "undo_change",
      {
        description:
          "Undo a change by restoring the files it touched, as a new commit. Without commit_sha: your own last change. Refuses if those files changed again since.",
        inputSchema: z.object({
          project_id: projectId,
          commit_sha: z.string().min(7).optional(),
          message: message.optional(),
          dry_run: dryRun,
        }),
        annotations: destructive,
      },
      ({ project_id, ...input }) =>
        run("undo_change", async () =>
          describeConflicts(await service.undoChange(agent, project_id, input)),
        ),
    );
  }

  if (has(EAgentScope.ORG_READ)) {
    server.registerTool(
      "get_organization",
      {
        description:
          "This organization: your role, owner, members and invites.",
        annotations: readOnly,
      },
      () => run("get_organization", () => org.getOrganization(agent)),
    );
  }

  if (has(EAgentScope.MEMBERS_WRITE)) {
    server.registerTool(
      "invite_member",
      {
        description: "Invite someone by email (they're emailed).",
        inputSchema: z.object({ email: z.email(), role: memberRole }),
        annotations: { destructiveHint: false, idempotentHint: false },
      },
      (input) => run("invite_member", () => org.inviteMember(agent, input)),
    );

    server.registerTool(
      "update_member_role",
      {
        description:
          "Change a member's role (member: user_id or invite email).",
        inputSchema: z.object({ member: z.string().min(1), role: memberRole }),
        annotations: { destructiveHint: true, idempotentHint: true },
      },
      (input) =>
        run("update_member_role", () => org.updateMemberRole(agent, input)),
    );

    server.registerTool(
      "remove_member",
      {
        description:
          "Remove a member or cancel an invite; their access stops at once.",
        inputSchema: z.object({ member: z.string().min(1) }),
        annotations: { destructiveHint: true },
      },
      (input) => run("remove_member", () => org.removeMember(agent, input)),
    );
  }

  for (const tool of getRegisteredAgentTools()) {
    if (!has(tool.scope)) continue;
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema ?? z.object({}),
        annotations: tool.annotations,
      },
      (input: unknown) =>
        run(tool.name, () => tool.handler(agent, input as never)),
    );
  }

  return server;
};
