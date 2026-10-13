import brand from "@/config/brand";
import { getRegisteredAgentTools } from "@/lib/agentExtensions";
import { TChangesetChange } from "@/lib/git-engine/changeset";
import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { buildInstructions, EGuideTopic, getGuide } from "./agent.guide";
import * as org from "./agent.org";
import * as service from "./agent.service";
import {
  agentError,
  canWrite,
  createToolRunner,
  EToolErrorCode,
  invalidInput,
  portableSchema,
} from "./agent.tools";
import { EAgentScope, EContextPart, TAgentContext } from "./agent.type";

const MAX_CONFLICT_PREVIEW = 20_000;
const INVALID = "__invalid_input";

const ref = z.string().optional().describe("Commit or branch; default: latest");
const message = z
  .string()
  .min(1)
  .max(500)
  .describe("Commit message a non-developer understands");
const description = z
  .string()
  .max(10_000)
  .optional()
  .describe("Longer explanation stored with the change");
const dryRun = z.boolean().optional().describe("Preview without saving");
const expectedSha = z
  .string()
  .optional()
  .describe(
    "sha from your latest read_files or write result for this file; changes after every write. Default: the current file",
  );
const branchOptions = {
  branch: z
    .string()
    .optional()
    .describe(
      "Save to this branch instead of the site (default name if empty)",
    ),
  open_pr: z
    .boolean()
    .optional()
    .describe("Open a pull request from the branch; live only after merging"),
};

const fileInput = z.object({
  path: z.string(),
  content: z.string().optional().describe("UTF-8 text"),
  content_base64: z.string().optional().describe("Binary, base64"),
  expected_sha: z
    .string()
    .nullable()
    .optional()
    .describe(
      "sha from read_files or the last write's files[].sha; null for a new file. Changes after every write",
    ),
});

const memberRole = z.enum(["admin", "editor"]);

// A list, not a free-form object: Gemini rejects object schemas without properties.
const fieldValues = z
  .array(
    z.object({
      field: z
        .string()
        .min(1)
        .describe(
          'Name from read_files or get_schema; dots for nesting: "banner.title"',
        ),
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
      throw agentError(
        `${entry.field}: pass exactly one of value or value_json`,
        400,
        EToolErrorCode.INVALID_INPUT,
        { fix: "Use value for text, value_json for anything else." },
      );
    }
    if (entry.value !== undefined) {
      map[entry.field] = entry.value;
      continue;
    }
    try {
      map[entry.field] = JSON.parse(entry.value_json!);
    } catch {
      throw agentError(
        `${entry.field}: value_json isn't valid JSON`,
        400,
        EToolErrorCode.INVALID_INPUT,
        { fix: 'Quote text as JSON ("text"), or pass it as value.' },
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
  };
};

type TStandardSchema = {
  "~standard": {
    validate: (value: unknown) => unknown;
  };
};

type TValidation = {
  value?: unknown;
  issues?: readonly { path?: readonly unknown[]; message: string }[];
};

// Bad input reaches the handler as a marker, so it gets the usual error shape and is counted.
const lenient = <S extends TStandardSchema>(schema: S): S => {
  const standard = schema["~standard"];
  return {
    ...schema,
    "~standard": {
      ...standard,
      validate: async (value: unknown) => {
        const result = (await standard.validate(value)) as TValidation;
        return result.issues?.length
          ? { value: { [INVALID]: result.issues } }
          : result;
      },
    },
  };
};

const readOnly = (title: string) => ({
  title,
  readOnlyHint: true,
  idempotentHint: true,
  openWorldHint: false,
});
const writes = (title: string) => ({
  title,
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: false,
});

/** One server per request, bound to the already-verified agent. Tools the token can't use aren't listed. */
export const buildMcpServer = (agent: TAgentContext): McpServer => {
  const server = new McpServer(
    { name: brand.slug, version: "1.3.0" },
    { instructions: buildInstructions(agent) },
  );
  const run = createToolRunner(agent);
  // Every tool, core or extension, advertises portable JSON Schema (see portableSchema).
  const registerTool = server.registerTool.bind(server);
  server.registerTool = ((
    name: string,
    config: { inputSchema?: Parameters<typeof portableSchema>[0] },
    cb: (...args: unknown[]) => unknown,
  ) =>
    registerTool(
      name,
      (config.inputSchema
        ? {
            ...config,
            inputSchema: lenient(
              portableSchema(config.inputSchema) as unknown as TStandardSchema,
            ),
          }
        : config) as never,
      (config.inputSchema
        ? (...args: unknown[]) => {
            const input = args[0] as Record<string, unknown> | undefined;
            if (input && INVALID in input) {
              return run(name, async () => {
                const { error, fix } = invalidInput(
                  input[INVALID] as TValidation["issues"] & object,
                );
                throw agentError(error, 400, EToolErrorCode.INVALID_INPUT, {
                  fix,
                });
              });
            }
            return cb(...args);
          }
        : cb) as never,
    )) as typeof server.registerTool;
  const has = (scope: EAgentScope) => agent.scopes.has(scope);
  const single = service.onlyProjectId(agent);
  const projectId = single
    ? z
        .string()
        .optional()
        .describe("Optional: this token has one site, used by default")
    : z.string().describe("From list_projects");
  // Without git:branch the options aren't listed (pull_request write mode still branches on its own).
  const withBranch = <S extends z.ZodObject>(schema: S): S =>
    has(EAgentScope.GIT_BRANCH)
      ? schema
      : (schema.omit({ branch: true, open_pr: true } as never) as unknown as S);

  if (has(EAgentScope.PROJECTS_READ)) {
    server.registerTool(
      "list_projects",
      {
        description:
          "Sites this token can reach, with project_id, name, framework and site URL. Call it first: the project_id every other tool needs comes from here.",
        annotations: readOnly("List sites"),
      },
      () =>
        run("list_projects", () =>
          service.listProjects(agent).then((projects) => ({ projects })),
        ),
    );
  }

  server.registerTool(
    "get_guide",
    {
      description:
        "Step-by-step recipe for one kind of request (editing text, settings, images, undo, errors…), naming only tools this token has. Use when unsure which tool fits, or after an unexpected error.",
      inputSchema: z.object({
        topic: z.enum(EGuideTopic),
      }),
      annotations: readOnly("How to do a task"),
    },
    ({ topic }) =>
      run("get_guide", async () => getGuide(agent, topic as EGuideTopic)),
  );

  if (has(EAgentScope.CONTENT_READ)) {
    server.registerTool(
      "get_project_context",
      {
        description:
          "Site overview: framework, content and media folders, schemas, where_to_edit (settings, styles, templates), permissions and head_commit. Call once per site after list_projects and reuse it; include adds detail.",
        inputSchema: z.object({
          project_id: projectId,
          include: z
            .array(z.enum(EContextPart))
            .optional()
            .describe(
              "Extra detail: schema fields, all folders, samples, config",
            ),
        }),
        annotations: readOnly("Site overview"),
      },
      ({ project_id, include }) =>
        run("get_project_context", () =>
          service.getProjectContext(agent, project_id, include),
        ),
    );

    server.registerTool(
      "get_schema",
      {
        description:
          "One content schema with every field, type, option and default. Use before create_entry, or to check field names for update_fields. The name comes from get_project_context schemas.",
        inputSchema: z.object({
          project_id: projectId,
          name: z
            .string()
            .describe("Schema name or path from get_project_context"),
        }),
        annotations: readOnly("Content schema"),
      },
      ({ project_id, name }) =>
        run("get_schema", () => service.getSchema(agent, project_id, name)),
    );

    server.registerTool(
      "list_files",
      {
        description:
          "File paths under a folder, sorted and paginated. Use to find a file by location. For text inside files use search_content; for posts with titles and dates use list_entries.",
        inputSchema: z.object({
          project_id: projectId,
          path: z.string().optional().describe("Folder; default: whole repo"),
          glob: z.string().optional().describe("e.g. **/*.md"),
          ref,
          limit: z
            .number()
            .int()
            .min(1)
            .max(2000)
            .optional()
            .describe("Default 500"),
          cursor: z
            .string()
            .optional()
            .describe("next_cursor of the last page"),
          include_sha: z.boolean().optional(),
        }),
        annotations: readOnly("List files"),
      },
      ({ project_id, ...options }) =>
        run("list_files", () => service.listFiles(agent, project_id, options)),
    );

    server.registerTool(
      "read_files",
      {
        description:
          "Read 1–20 files. Each comes with its sha: pass it as expected_sha when writing that file. Paths come from search_content, list_files, list_entries or where_to_edit; never guess them.",
        inputSchema: z.object({
          project_id: projectId,
          paths: z.array(z.string()).min(1).max(20),
          ref,
        }),
        annotations: readOnly("Read files"),
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
          "Find text (substring) in content, then in templates, styles and settings. Use the user's own words. Matches give path, line and can_edit. Next: edit_file for text, update_fields for frontmatter or settings.",
        inputSchema: z.object({
          project_id: projectId,
          query: z.string().min(1).max(200),
          path: z.string().optional().describe("Search one folder only"),
          glob: z.string().optional(),
          case_sensitive: z.boolean().optional(),
          limit: z
            .number()
            .int()
            .min(1)
            .max(200)
            .optional()
            .describe("Default 25"),
        }),
        annotations: readOnly("Search site"),
      },
      ({ project_id, ...options }) =>
        run("search_content", () =>
          service.searchContent(agent, project_id, options),
        ),
    );

    server.registerTool(
      "list_entries",
      {
        description:
          'Posts or pages in one content folder with chosen frontmatter (default title, date, draft), filtered by title and sorted. Use for "my latest posts" or "which are drafts". folder or schema comes from get_project_context.',
        inputSchema: z.object({
          project_id: projectId,
          folder: z.string().optional().describe("e.g. src/content/blog"),
          schema: z.string().optional().describe("Instead of folder"),
          fields: z
            .array(z.string())
            .max(20)
            .optional()
            .describe("Frontmatter to return; default title, date, draft"),
          query: z.string().optional().describe("Substring of the title"),
          sort: z
            .enum(service.EEntrySort)
            .optional()
            .describe("Default date_desc"),
          limit: z
            .number()
            .int()
            .min(1)
            .max(100)
            .optional()
            .describe("Default 20"),
          cursor: z
            .string()
            .optional()
            .describe("next_cursor of the last page"),
        }),
        annotations: readOnly("List posts and pages"),
      },
      ({ project_id, ...input }) =>
        run("list_entries", () =>
          service.listEntries(agent, project_id, input),
        ),
    );

    server.registerTool(
      "list_history",
      {
        description:
          'Recent changes, optionally for one file: commit sha, message, author, date. Use for "what changed" and to find a commit_sha for get_change or undo_change.',
        inputSchema: z.object({
          project_id: projectId,
          path: z.string().optional(),
          limit: z
            .number()
            .int()
            .min(1)
            .max(100)
            .optional()
            .describe("Default 20"),
        }),
        annotations: readOnly("Change history"),
      },
      ({ project_id, path, limit }) =>
        run("list_history", () =>
          service
            .listHistory(agent, project_id, { path, limit })
            .then((commits) => ({ commits })),
        ),
    );

    server.registerTool(
      "get_change",
      {
        description:
          "What one change did: subject, who made it, date, and each file added, removed or modified with a capped diff. commit_sha comes from list_history or a write result. To revert it, use undo_change.",
        inputSchema: z.object({
          project_id: projectId,
          commit_sha: z
            .string()
            .min(7)
            .describe("From list_history or a write result"),
        }),
        annotations: readOnly("Show one change"),
      },
      ({ project_id, commit_sha }) =>
        run("get_change", () =>
          service.getChange(agent, project_id, { commit_sha }),
        ),
    );

    server.registerTool(
      "get_deploy_status",
      {
        description:
          "Is a change live? Build and deploy state (live, building, failed, unknown) with a plain summary. Pass the commit from a write result; default: latest. Only state=live means live.",
        inputSchema: z.object({
          project_id: projectId,
          commit_sha: z
            .string()
            .optional()
            .describe("commit from a write result; default: latest"),
        }),
        annotations: readOnly("Deploy status"),
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
          "Commands to clone or sync a local copy (needs a shell), with a 1-hour read-only key. Pass local_head to learn whether a sync is needed. Save local edits with write_files and base_commit, never git push.",
        inputSchema: z.object({
          project_id: projectId,
          local_head: z.string().optional().describe("git rev-parse HEAD"),
        }),
        annotations: readOnly("Local copy commands"),
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
          "Find-and-replace text inside one file: visible wording, templates, styles. Copy old_string exactly from search_content or read_files. For frontmatter or settings values use update_fields; for whole files or deletes, write_files.",
        inputSchema: withBranch(
          z.object({
            project_id: projectId,
            path: z.string().describe("From search_content or read_files"),
            edits: z
              .array(
                z.object({
                  old_string: z
                    .string()
                    .min(1)
                    .describe("Exact text now in the file; must match once"),
                  new_string: z.string(),
                  replace_all: z.boolean().optional(),
                }),
              )
              .min(1)
              .max(50),
            message,
            description,
            expected_sha: expectedSha,
            dry_run: dryRun,
            ...branchOptions,
          }),
        ),
        annotations: writes("Edit text in a file"),
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
          "Set or remove named frontmatter fields (title, date, draft, image…) or values in a JSON/YAML/TOML settings file; the rest stays byte for byte. Field names come from read_files or get_schema. For body text use edit_file.",
        inputSchema: withBranch(
          z.object({
            project_id: projectId,
            path: z.string().describe("From read_files or where_to_edit"),
            set: fieldValues.optional(),
            unset: z.array(z.string()).optional(),
            allow_new_fields: z
              .boolean()
              .optional()
              .describe(
                "Allow names the schema doesn't define; only when the user asks for a new field",
              ),
            message,
            description,
            expected_sha: expectedSha,
            dry_run: dryRun,
            ...branchOptions,
          }),
        ),
        annotations: writes("Update fields"),
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
          "Add a new post or page from its folder's schema: defaults filled, fields checked, never overwrites. folder or schema from get_project_context; field names from get_schema. To change an existing entry use update_fields.",
        inputSchema: withBranch(
          z.object({
            project_id: projectId,
            folder: z.string().optional().describe("e.g. src/content/blog"),
            schema: z.string().optional().describe("Instead of folder"),
            title: z.string().optional(),
            slug: z
              .string()
              .optional()
              .describe("File name; default from title"),
            fields: fieldValues.optional(),
            body: z.string().optional().describe("Markdown body"),
            message: message.optional(),
            description,
            dry_run: dryRun,
            ...branchOptions,
          }),
        ),
        annotations: {
          ...writes("Create post or page"),
          destructiveHint: false,
        },
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
          "One-time link to upload a local file (image, PDF) with curl; the server saves it and returns site_path. Use it for images instead of base64 in write_files, then put site_path in content with update_fields or edit_file.",
        inputSchema: z.object({
          project_id: projectId,
          path: z
            .string()
            .describe(
              "Destination under the media folder, e.g. public/images/hero.jpg",
            ),
          overwrite: z.boolean().optional(),
          message: message.optional(),
        }),
        annotations: writes("Upload a file"),
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
          "Create, replace or delete whole files in one change: multi-file or code edits, deletes. Existing files need expected_sha (null when new) unless base_commit. Small text edits: edit_file; frontmatter: update_fields; renames: move_file.",
        inputSchema: withBranch(
          z.object({
            project_id: projectId,
            message,
            description,
            files: z.array(fileInput).max(100).default([]),
            deletes: z
              .array(
                z.object({
                  path: z.string(),
                  expected_sha: z
                    .string()
                    .optional()
                    .describe("sha from read_files"),
                }),
              )
              .max(100)
              .default([]),
            base_commit: z
              .string()
              .optional()
              .describe("Local clone's HEAD (get_clone_command)"),
            dry_run: dryRun,
            ...branchOptions,
          }),
        ),
        annotations: writes("Write files"),
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
              throw agentError(
                `${file.path}: pass exactly one of content or content_base64`,
                400,
                EToolErrorCode.INVALID_INPUT,
              );
            }
            if (!input.base_commit && file.expected_sha === undefined) {
              throw agentError(
                `${file.path}: pass expected_sha from read_files (null for a new file) or base_commit`,
                400,
                EToolErrorCode.INVALID_INPUT,
                { fix: "read_files the file first and use its sha." },
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
              throw agentError(
                `${del.path}: pass expected_sha from read_files or base_commit`,
                400,
                EToolErrorCode.INVALID_INPUT,
                { fix: "read_files the file first and use its sha." },
              );
            }
            if (del.expected_sha) expected[del.path] = del.expected_sha;
            changes.push({ op: "delete", path: del.path });
          }
          if (!changes.length) {
            throw agentError(
              "Nothing to write",
              400,
              EToolErrorCode.INVALID_INPUT,
            );
          }
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
        description:
          "Rename or move one file; links to it aren't updated (find them with search_content). from comes from list_files or read_files; expected_sha defaults to the current file. To delete, use write_files.",
        inputSchema: withBranch(
          z.object({
            project_id: projectId,
            from: z.string(),
            to: z.string(),
            expected_sha: expectedSha,
            message,
            description,
            dry_run: dryRun,
            ...branchOptions,
          }),
        ),
        annotations: writes("Rename or move a file"),
      },
      ({ project_id, ...input }) =>
        run("move_file", async () =>
          describeConflicts(await service.moveFile(agent, project_id, input)),
        ),
    );

    server.registerTool(
      "undo_change",
      {
        description:
          "Undo a change by restoring the files it touched, as a new change. Without commit_sha it undoes your own last change; otherwise take commit_sha from list_history. Refuses if those files changed again since.",
        inputSchema: withBranch(
          z.object({
            project_id: projectId,
            commit_sha: z
              .string()
              .min(7)
              .optional()
              .describe("From list_history; default: your last change"),
            message: message.optional(),
            description,
            dry_run: dryRun,
            ...branchOptions,
          }),
        ),
        annotations: writes("Undo a change"),
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
          "This organization: your role, owner, members and pending invites. Use before changing members; user_id values for update_member_role and remove_member come from here.",
        annotations: readOnly("Organization and members"),
      },
      () => run("get_organization", () => org.getOrganization(agent)),
    );
  }

  if (has(EAgentScope.MEMBERS_WRITE)) {
    server.registerTool(
      "invite_member",
      {
        description:
          "Invite someone to the organization by email as editor or admin; they get an email. Confirm the address with the user first. To change an existing member's role, use update_member_role.",
        inputSchema: z.object({ email: z.email(), role: memberRole }),
        annotations: {
          title: "Invite a member",
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: true,
        },
      },
      (input) => run("invite_member", () => org.inviteMember(agent, input)),
    );

    server.registerTool(
      "update_member_role",
      {
        description:
          "Change a member's role to editor or admin. member is a user_id or invite email from get_organization.",
        inputSchema: z.object({
          member: z.string().min(1).describe("user_id or invite email"),
          role: memberRole,
        }),
        annotations: {
          ...writes("Change a member's role"),
          idempotentHint: true,
        },
      },
      (input) =>
        run("update_member_role", () => org.updateMemberRole(agent, input)),
    );

    server.registerTool(
      "remove_member",
      {
        description:
          "Remove a member or cancel a pending invite; their access stops at once. member is a user_id or invite email from get_organization. Confirm with the user first.",
        inputSchema: z.object({
          member: z.string().min(1).describe("user_id or invite email"),
        }),
        annotations: writes("Remove a member"),
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
