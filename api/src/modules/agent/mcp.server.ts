import config from "@/config/variables";
import ApiError from "@/errors/ApiError";
import { getRegisteredAgentTools } from "@/lib/agentExtensions";
import { TChangesetChange } from "@/lib/git-engine/changeset";
import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import * as org from "./agent.org";
import * as service from "./agent.service";
import { canWrite, createToolRunner } from "./agent.tools";
import { EAgentScope, EContextPart, TAgentContext } from "./agent.type";

const MAX_CONFLICT_PREVIEW = 20_000;

const INSTRUCTIONS = [
  'Sitepins is a Git-based CMS for websites. The people you help are usually not developers: they say things like "change the banner to red", "fix the typo on the about page" or "save my changes". Translate that into these tools and answer in plain words, without git jargon.',
  "Start with list_projects (if there are several sites and the user didn't say which, ask), then get_project_context once. Its where_to_edit lists settings files (site name, menus, links), style files (colours, fonts) and template folders (headers, banners, sections).",
  'To find what the user means, use search_content with the words they used ("banner", "hero", the visible text); it looks in content first, then the rest of the site. Read candidates with read_files, then change them with edit_file (small find-and-replace) or write_files (new or rewritten files).',
  "Saving: every edit_file, write_files or move_file call is saved and published to the site's repository immediately; there is no separate save or push step. When the user says save, push, publish or commit, either make the pending change or confirm what was already saved (list_history shows recent changes). If the token's write mode is pull_request, changes go to a pull request that someone must merge before they go live; say so and share its link.",
  'Write commit messages a non-developer would understand, e.g. "Make the homepage banner red". For anything risky or ambiguous, describe the change and confirm before writing, or use dry_run.',
  'Undo ("put it back", "revert that"): call undo_change with the commit sha of that change (from the write result or list_history); confirm which change first if it isn\'t obvious.',
  "Is it live? Call get_deploy_status after a change and relay its summary; if it's still building, check again shortly. A saved change isn't necessarily live yet.",
  "If a tool says the token lacks a permission, tell the user which setting to switch on, using the name the error gives.",
  "If you can run shell commands, get_clone_command gives a read-only local clone; save edits with write_files, never git push.",
].join(" ");

const projectId = z.string().describe("Project id from list_projects");
const ref = z
  .string()
  .optional()
  .describe("Commit sha or branch; defaults to the project branch");

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

const branchInput = {
  branch: z
    .string()
    .optional()
    .describe("Commit to this branch instead (needs git:branch)"),
  open_pr: z
    .boolean()
    .optional()
    .describe("Open a pull request from the branch"),
};

const memberRole = z.enum(["admin", "editor"]);

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
    { name: "sitepins", version: "1.1.0" },
    { instructions: INSTRUCTIONS },
  );
  const run = createToolRunner(agent);
  const has = (scope: EAgentScope) => agent.scopes.has(scope);

  if (has(EAgentScope.PROJECTS_READ)) {
    server.registerTool(
      "list_projects",
      {
        description: "Projects (sites) this agent may access.",
        annotations: { readOnlyHint: true },
      },
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
          "Summary of a site: framework, content/media folders, schema names, largest content folders, writable paths, dev command and head commit. Pass include for more detail.",
        inputSchema: z.object({
          project_id: projectId,
          include: z
            .array(z.enum(EContextPart))
            .optional()
            .describe(
              "schemas: fields of every schema; folders: all content folders; samples: example content paths; config: .sitepins/config.json",
            ),
        }),
        annotations: { readOnlyHint: true },
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
          "One content schema in full (fields, types, options), by name or path.",
        inputSchema: z.object({
          project_id: projectId,
          name: z
            .string()
            .describe("Schema name from get_project_context, or its path"),
        }),
        annotations: { readOnlyHint: true },
      },
      ({ project_id, name }) =>
        run("get_schema", () => service.getSchema(agent, project_id, name)),
    );

    server.registerTool(
      "list_files",
      {
        description:
          "File paths under a folder (recursive), sorted and paginated. Filter with a glob such as **/*.md.",
        inputSchema: z.object({
          project_id: projectId,
          path: z
            .string()
            .optional()
            .describe("Folder; omit for the whole repository"),
          glob: z
            .string()
            .optional()
            .describe("Matched against paths relative to `path`"),
          ref,
          limit: z.number().int().min(1).max(2000).optional(),
          cursor: z
            .string()
            .optional()
            .describe("next_cursor from the previous page"),
          include_sha: z
            .boolean()
            .optional()
            .describe("Return {path, sha} instead of bare paths"),
        }),
        annotations: { readOnlyHint: true },
      },
      ({ project_id, ...options }) =>
        run("list_files", () => service.listFiles(agent, project_id, options)),
    );

    server.registerTool(
      "read_file",
      {
        description:
          "Read a file. Returns its blob sha; pass it as expected_sha when you write the file back. Use ref to read an older version.",
        inputSchema: z.object({
          project_id: projectId,
          path: z.string(),
          ref,
        }),
        annotations: { readOnlyHint: true },
      },
      ({ project_id, path, ref }) =>
        run("read_file", () =>
          service.readFile(agent, project_id, { path, ref }),
        ),
    );

    server.registerTool(
      "read_files",
      {
        description:
          "Read up to 20 files in one call, each with its blob sha. Prefer this over repeated read_file.",
        inputSchema: z.object({
          project_id: projectId,
          paths: z.array(z.string()).min(1).max(20),
          ref,
        }),
        annotations: { readOnlyHint: true },
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
          "Find text in the site (plain substring, case-insensitive by default): content folders and the rest of the site (templates, styles, settings), up to `limit` matches each (default 25). Each match says its area and whether this token can edit it. Pass path to search one folder.",
        inputSchema: z.object({
          project_id: projectId,
          query: z.string().min(1).max(200),
          path: z.string().optional().describe("Folder to search instead"),
          glob: z.string().optional().describe("e.g. **/*.md"),
          case_sensitive: z.boolean().optional(),
          limit: z.number().int().min(1).max(200).optional(),
        }),
        annotations: { readOnlyHint: true },
      },
      ({ project_id, ...options }) =>
        run("search_content", () =>
          service.searchContent(agent, project_id, options),
        ),
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
          "Whether a change is live: the build/deploy state the hosting provider reports for a commit (default: the latest), with a plain-language summary, the live URL when known, and failure details.",
        inputSchema: z.object({
          project_id: projectId,
          commit_sha: z
            .string()
            .optional()
            .describe("Commit from a write result or list_history"),
        }),
        annotations: { readOnlyHint: true },
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
          "Shell commands to clone the site locally (read-only) and to pull updates, for agents that can run git. Edit files locally, then save them with write_files, passing the cloned commit as base_commit.",
        inputSchema: z.object({ project_id: projectId }),
        annotations: { readOnlyHint: true },
      },
      ({ project_id }) =>
        run("get_clone_command", async () => {
          const project = await service.resolveProject(
            agent,
            project_id,
            EAgentScope.CONTENT_READ,
          );
          if (!config.base_url) {
            throw new ApiError(
              "This server has no BASE_URL configured",
              500,
              "",
            );
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
  }

  if (has(EAgentScope.CONTENT_READ) && canWrite(agent)) {
    server.registerTool(
      "edit_file",
      {
        description:
          "Find-and-replace inside one text file, committed by the Sitepins bot. Each old_string must match exactly once (or set replace_all). No need to send the whole file; if the text isn't found, re-read the file.",
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
          message: z.string().min(1).max(500).describe("Commit message"),
          description: z.string().max(10_000).optional(),
          expected_sha: z
            .string()
            .optional()
            .describe("Fail if the file is no longer at this sha"),
          dry_run: z.boolean().optional(),
          ...branchInput,
        }),
        annotations: { destructiveHint: true, idempotentHint: false },
      },
      ({ project_id, ...input }) =>
        run("edit_file", async () =>
          describeConflicts(await service.editFile(agent, project_id, input)),
        ),
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
              z.object({
                path: z.string(),
                expected_sha: z.string().optional(),
              }),
            )
            .max(100)
            .default([]),
          base_commit: z
            .string()
            .optional()
            .describe("Head commit your edits are based on"),
          dry_run: z.boolean().optional(),
          ...branchInput,
        }),
        annotations: { destructiveHint: true, idempotentHint: false },
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
      "undo_change",
      {
        description:
          "Undo an earlier change: puts back every file a commit touched, as it was before, in a new commit by the Sitepins bot. Get commit_sha from a write result or list_history. If those files were changed again afterwards, nothing is committed and you get their current content instead.",
        inputSchema: z.object({
          project_id: projectId,
          commit_sha: z.string().min(7),
          message: z
            .string()
            .max(500)
            .optional()
            .describe('Defaults to: Undo "<original message>"'),
          dry_run: z.boolean().optional(),
          ...branchInput,
        }),
        annotations: { destructiveHint: true, idempotentHint: false },
      },
      ({ project_id, ...input }) =>
        run("undo_change", async () =>
          describeConflicts(await service.undoChange(agent, project_id, input)),
        ),
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
          expected_sha: z
            .string()
            .describe("Blob sha of `from` from read_file"),
          message: z.string().min(1).max(500),
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
  }

  if (has(EAgentScope.ORG_READ)) {
    server.registerTool(
      "get_organization",
      {
        description:
          "This token's organization: name, your role, owner, members with roles and invite status, and project count.",
        annotations: { readOnlyHint: true },
      },
      () => run("get_organization", () => org.getOrganization(agent)),
    );
  }

  if (has(EAgentScope.MEMBERS_WRITE)) {
    server.registerTool(
      "invite_member",
      {
        description:
          "Invite someone to this organization by email. They get an email; without an account the invite stays pending until they sign up.",
        inputSchema: z.object({ email: z.email(), role: memberRole }),
        annotations: { destructiveHint: false, idempotentHint: false },
      },
      (input) => run("invite_member", () => org.inviteMember(agent, input)),
    );

    server.registerTool(
      "update_member_role",
      {
        description:
          "Change a member's role. member is the user_id (or email for a pending invite) from get_organization.",
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
          "Remove a member (or cancel a pending invite). Their access, including their AI tokens for this organization, stops at once.",
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
