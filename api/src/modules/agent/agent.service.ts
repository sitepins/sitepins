import ApiError from "@/errors/ApiError";
import {
  applyChangeset,
  buildCommitMessage,
  ChangesetPolicyError,
  TApplyChangesetResult,
  TChangesetChange,
} from "@/lib/git-engine/changeset";
import { GitEngineError } from "@/lib/git-engine/errors";
import { normalizeRepoPath, TPathPolicy } from "@/lib/git-engine/path-policy";
import { TGitClient } from "@/lib/git-engine/types";
import { runAgentAccessGuard } from "@/lib/extensionGuards";
import { logger } from "@/lib/logger";
import { broadcastExternalCommit } from "@/modules/common/editor.gateway";
import { ProjectLog } from "@/modules/project-log/project-log.model";
import {
  EProjectLogAction,
  EProjectLogType,
} from "@/modules/project-log/project-log.type";
import { Project } from "@/modules/project/project.model";
import { TProjectType } from "@/modules/project/project.type";
import { requireScope } from "./agent.auth";
import { createProjectGitClient, isGitLabProject } from "./agent.git";
import { EAgentScope, EAgentWriteMode, TAgentContext } from "./agent.type";

export const SITE_CONFIG_PATH = ".sitepins/config.json";
const SCHEMA_DIR = ".sitepins/schema";
const SNIPPET_DIR = ".sitepins/snippet";
const MAX_READ_BYTES = 2 * 1024 * 1024;
const BRANCH_NAME = /^[A-Za-z0-9._/-]{1,200}$/;

export type TSiteConfig = {
  content?: string;
  media?: string;
  public?: string;
  configs?: string[];
};

export type TProjectRoots = {
  content: string[];
  media: string[];
  schema: string[];
};

export type TChangesetRequest = {
  base_commit?: string;
  expected_shas?: Record<string, string | null>;
  message: string;
  description?: string;
  changes: TChangesetChange[];
  dry_run?: boolean;
  branch?: string;
  open_pr?: boolean;
};

export type TAgentChangesetResult = TApplyChangesetResult & {
  branch: string;
  pull_request?: { number: number; url: string };
};

// GitLab has no app identity, so agent commits carry the Sitepins name.
const GITLAB_AUTHOR = { name: "Sitepins", email: "sitepins@sitepins.com" };

const gitAuthor = (project: TProjectType) =>
  isGitLabProject(project)
    ? GITLAB_AUTHOR
    : // GitHub attributes installation-token commits to the app itself.
      undefined;

export const resolveProject = async (
  agent: TAgentContext,
  projectId: unknown,
  scope: EAgentScope,
): Promise<TProjectType> => {
  requireScope(agent, scope);
  if (
    typeof projectId !== "string" ||
    !(agent.grant.all_projects || agent.grant.project_ids.includes(projectId))
  ) {
    throw new ApiError(
      "Project not found or not shared with this agent",
      404,
      "",
    );
  }
  const project = await Project.findOne({
    project_id: projectId,
  }).lean<TProjectType>();
  if (!project || project.org_id !== agent.grant.org_id) {
    throw new ApiError(
      "Project not found or not shared with this agent",
      404,
      "",
    );
  }
  await runAgentAccessGuard({
    user_id: agent.user_id,
    org_id: project.org_id,
    project_id: project.project_id,
    project_owner_id: project.user_id,
    write: false,
  });
  return project;
};

const assertWritable = (project: TProjectType) => {
  if (project.status === "archived") {
    throw new ApiError("This project is archived", 403, "");
  }
};

const cleanRoot = (root: unknown): string | undefined => {
  if (typeof root !== "string" || !root.trim() || root.trim() === ".")
    return undefined;
  try {
    return normalizeRepoPath(root.trim().replace(/\/+$/, ""));
  } catch {
    return undefined;
  }
};

export const rootsFromConfig = (
  siteConfig: TSiteConfig | null,
): TProjectRoots => ({
  content: [
    cleanRoot(siteConfig?.content),
    ...(siteConfig?.configs ?? []).map(cleanRoot),
  ].filter((r): r is string => Boolean(r)),
  media: [cleanRoot(siteConfig?.media)].filter((r): r is string => Boolean(r)),
  // config.json defines these roots, so changing it is a code change.
  schema: [SCHEMA_DIR, SNIPPET_DIR],
});

/** The permission that would let this token write `path`. */
export const scopeForPath = (path: string, roots: TProjectRoots) => {
  if (roots.schema.some((r) => under(path, r))) return EAgentScope.SCHEMA_WRITE;
  if (roots.media.some((r) => under(path, r))) return EAgentScope.MEDIA_WRITE;
  if (roots.content.some((r) => under(path, r)))
    return EAgentScope.CONTENT_WRITE;
  return EAgentScope.CODE_WRITE;
};

export const policyFor = (
  scopes: Set<EAgentScope>,
  roots: TProjectRoots,
): TPathPolicy => {
  if (scopes.has(EAgentScope.CODE_WRITE)) return { writableRoots: "all" };
  return {
    writableRoots: [
      ...(scopes.has(EAgentScope.CONTENT_WRITE) ? roots.content : []),
      ...(scopes.has(EAgentScope.MEDIA_WRITE) ? roots.media : []),
      ...(scopes.has(EAgentScope.SCHEMA_WRITE) ? roots.schema : []),
    ],
  };
};

const under = (path: string, root: string) =>
  path === root || path.startsWith(`${root}/`);

export const logTypeFor = (
  path: string,
  roots: TProjectRoots,
  siteConfig: TSiteConfig | null,
) => {
  if (under(path, SCHEMA_DIR)) return EProjectLogType.SCHEMA;
  if (under(path, SNIPPET_DIR)) return EProjectLogType.SNIPPET;
  if (under(path, ".sitepins")) return EProjectLogType.CONFIG;
  if (roots.media.some((r) => under(path, r))) return EProjectLogType.MEDIA;
  const configs = (siteConfig?.configs ?? [])
    .map(cleanRoot)
    .filter(Boolean) as string[];
  if (configs.some((r) => under(path, r))) return EProjectLogType.CONFIG;
  if (roots.content.some((r) => under(path, r))) return EProjectLogType.CONTENT;
  return EProjectLogType.CODE;
};

const readSiteConfig = async (
  client: TGitClient,
  ref: string,
): Promise<TSiteConfig | null> => {
  const file = await client.readFile(ref, SITE_CONFIG_PATH);
  if (!file) return null;
  try {
    const parsed = JSON.parse(file.content.toString("utf-8"));
    return parsed && typeof parsed === "object"
      ? (parsed as TSiteConfig)
      : null;
  } catch {
    return null;
  }
};

const requireHead = async (client: TGitClient) => {
  const head = await client.readHead();
  if (!head)
    throw new ApiError(
      `Branch ${client.branch} doesn't exist or the repository is empty`,
      404,
      "",
    );
  return head;
};

export const listProjects = async (agent: TAgentContext) => {
  requireScope(agent, EAgentScope.PROJECTS_READ);
  const projects = await Project.find({
    org_id: agent.grant.org_id,
    ...(!agent.grant.all_projects && {
      project_id: { $in: agent.grant.project_ids },
    }),
  })
    .select(
      "project_id project_name provider repository branch generator site_url status user_id org_id",
    )
    .lean<TProjectType[]>();
  const checks = await Promise.allSettled(
    projects.map((p) =>
      runAgentAccessGuard({
        user_id: agent.user_id,
        org_id: p.org_id,
        project_id: p.project_id,
        project_owner_id: p.user_id,
        write: false,
      }),
    ),
  );
  const allowed = projects.filter((_, i) => checks[i].status === "fulfilled");
  const refused = checks.find((c) => c.status === "rejected");
  if (!allowed.length && refused) throw refused.reason;
  return allowed.map((p) => ({
    project_id: p.project_id,
    name: p.project_name,
    provider: p.provider,
    repository: p.repository,
    branch: p.branch,
    generator: p.generator,
    site_url: p.site_url,
    archived: p.status === "archived",
  }));
};

type TSchemaSummary = {
  name: string;
  path: string;
  file?: string;
  fileType?: string;
  fields: {
    name: string;
    type: string;
    required: boolean;
    description?: string;
    options?: string[];
  }[];
};

type TSchemaField = {
  name?: unknown;
  type?: unknown;
  isRequired?: unknown;
  description?: unknown;
  options?: unknown;
};

const summarizeSchema = (path: string, raw: string): TSchemaSummary | null => {
  try {
    const schema = JSON.parse(raw) as {
      name?: unknown;
      file?: unknown;
      fileType?: unknown;
      template?: TSchemaField[];
    };
    return {
      name: typeof schema.name === "string" ? schema.name : path,
      path,
      file: typeof schema.file === "string" ? schema.file : undefined,
      fileType:
        typeof schema.fileType === "string" ? schema.fileType : undefined,
      fields: (Array.isArray(schema.template) ? schema.template : []).map(
        (f) => ({
          name: String(f.name ?? ""),
          type: String(f.type ?? ""),
          required: f.isRequired === true,
          ...(typeof f.description === "string" &&
            f.description && { description: f.description }),
          ...(Array.isArray(f.options) &&
            f.options.length && { options: f.options.map(String) }),
        }),
      ),
    };
  } catch {
    return null;
  }
};

const detectDevCommand = (
  generator: string | undefined,
  packageJson: string | null,
) => {
  if (packageJson) {
    try {
      const scripts =
        (JSON.parse(packageJson) as { scripts?: Record<string, string> })
          .scripts ?? {};
      for (const name of ["dev", "start", "serve"]) {
        if (scripts[name]) return `npm run ${name}`;
      }
    } catch {
      // ignore malformed package.json
    }
  }
  if (generator?.toLowerCase().includes("hugo")) return "hugo server";
  return undefined;
};

export const getProjectContext = async (
  agent: TAgentContext,
  projectId: unknown,
) => {
  const project = await resolveProject(
    agent,
    projectId,
    EAgentScope.CONTENT_READ,
  );
  const client = await createProjectGitClient(project, agent.user_id);
  const head = await requireHead(client);
  const siteConfig = await readSiteConfig(client, head);
  const roots = rootsFromConfig(siteConfig);
  const { entries, truncated } = await client.readTree(head);
  const files = entries.filter((e) => e.type === "blob").map((e) => e.path);

  const schemaPaths = files
    .filter((p) => under(p, SCHEMA_DIR) && p.endsWith(".json"))
    .slice(0, 50);
  const schemas = (
    await Promise.all(
      schemaPaths.map(async (path) => {
        const file = await client.readFile(head, path);
        return file
          ? summarizeSchema(path, file.content.toString("utf-8"))
          : null;
      }),
    )
  ).filter((s): s is TSchemaSummary => Boolean(s));

  const contentFiles = files.filter((p) =>
    roots.content.some((r) => under(p, r)),
  );
  const folders = new Map<string, number>();
  for (const path of contentFiles) {
    const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
    folders.set(dir, (folders.get(dir) ?? 0) + 1);
  }
  const packageJson = files.includes("package.json")
    ? ((await client.readFile(head, "package.json"))?.content.toString(
        "utf-8",
      ) ?? null)
    : null;
  const policy = policyFor(agent.scopes, roots);

  return {
    project: {
      project_id: project.project_id,
      name: project.project_name,
      provider: project.provider,
      repository: project.repository,
      branch: project.branch,
      generator: project.generator,
      site_url: project.site_url,
      archived: project.status === "archived",
    },
    head_commit: head,
    site_config: siteConfig,
    roots,
    schemas,
    content: {
      total_files: contentFiles.length,
      folders: [...folders]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 50)
        .map(([path, count]) => ({ path, files: count })),
      samples: contentFiles.slice(0, 20),
    },
    repository_files: files.length,
    tree_truncated: truncated,
    dev_command: detectDevCommand(project.generator, packageJson),
    access: {
      scopes: [...agent.scopes],
      write_mode: agent.grant.write_mode,
      writable: policy.writableRoots,
      never_writable: [
        ".github/workflows/",
        ".github/actions/",
        ".gitlab-ci.yml",
        ".gitmodules",
        "other CI config",
      ],
    },
    notes: siteConfig
      ? undefined
      : `${SITE_CONFIG_PATH} is missing, so content and media folders are unknown. Writes need code:write until the project is opened in Sitepins once.`,
  };
};

export const listFiles = async (
  agent: TAgentContext,
  projectId: unknown,
  options: { path?: string; ref?: string },
) => {
  const project = await resolveProject(
    agent,
    projectId,
    EAgentScope.CONTENT_READ,
  );
  const client = await createProjectGitClient(project, agent.user_id);
  const ref = options.ref || (await requireHead(client));
  const dir = options.path ? normalizeRepoPath(options.path) : undefined;
  const { entries, truncated } = await client.readTree(ref, dir);
  return { ref, truncated, entries };
};

export const readFile = async (
  agent: TAgentContext,
  projectId: unknown,
  options: { path: unknown; ref?: string },
) => {
  const project = await resolveProject(
    agent,
    projectId,
    EAgentScope.CONTENT_READ,
  );
  const path = normalizeRepoPath(options.path);
  const client = await createProjectGitClient(project, agent.user_id);
  const ref = options.ref || (await requireHead(client));
  const file = await client.readFile(ref, path);
  if (!file) throw new ApiError(`${path} doesn't exist at ${ref}`, 404, "");
  const isText = !file.content.subarray(0, 8000).includes(0);
  return {
    path,
    ref,
    sha: file.sha,
    bytes: file.content.length,
    encoding: isText ? "utf-8" : "base64",
    content:
      file.content.length > MAX_READ_BYTES
        ? null
        : file.content.toString(isText ? "utf-8" : "base64"),
    truncated: file.content.length > MAX_READ_BYTES,
  };
};

export const listHistory = async (
  agent: TAgentContext,
  projectId: unknown,
  options: { path?: string; limit?: number },
) => {
  const project = await resolveProject(
    agent,
    projectId,
    EAgentScope.CONTENT_READ,
  );
  const client = await createProjectGitClient(project, agent.user_id);
  const path = options.path ? normalizeRepoPath(options.path) : undefined;
  const limit = Math.min(Math.max(Number(options.limit) || 20, 1), 100);
  return client.listCommits({ path, limit });
};

const defaultAgentBranch = () =>
  `sitepins/agent-${new Date().toISOString().slice(0, 10)}-${Math.random().toString(36).slice(2, 7)}`;

const resolveTargetBranch = (
  agent: TAgentContext,
  project: TProjectType,
  input: TChangesetRequest,
) => {
  const forced = agent.grant.write_mode === EAgentWriteMode.PULL_REQUEST;
  const wants = forced || Boolean(input.branch) || Boolean(input.open_pr);
  if (!wants) return undefined;
  if (!forced) requireScope(agent, EAgentScope.GIT_BRANCH);
  const branch = input.branch || defaultAgentBranch();
  if (
    !BRANCH_NAME.test(branch) ||
    branch.includes("..") ||
    branch.startsWith("/") ||
    branch.endsWith("/") ||
    branch.endsWith(".lock") ||
    branch === project.branch
  ) {
    throw new ApiError(`Invalid branch name: ${branch}`, 400, "");
  }
  // Under a pull-request-only grant the agent may not pick an arbitrary existing branch.
  if (forced && !branch.startsWith("sitepins/")) {
    throw new ApiError(
      "This agent may only push to branches under sitepins/",
      403,
      "",
    );
  }
  return branch;
};

const logAction = (op: "upsert" | "delete", existed: boolean) =>
  op === "delete"
    ? EProjectLogAction.DELETE
    : existed
      ? EProjectLogAction.UPDATE
      : EProjectLogAction.CREATE;

const COMMIT_WINDOW_MS = 10 * 60_000;
const COMMITS_PER_WINDOW = 30;
const recentCommits = new Map<string, number[]>();

// Each write is a real commit on someone's site, so cap it per token.
const assertCommitBudget = (grantId: string) => {
  const since = Date.now() - COMMIT_WINDOW_MS;
  const recent = (recentCommits.get(grantId) ?? []).filter((t) => t > since);
  if (recent.length >= COMMITS_PER_WINDOW) {
    throw new ApiError(
      "Too many commits. Try again in a few minutes.",
      429,
      "",
    );
  }
  recentCommits.set(grantId, [...recent, Date.now()]);
};

export const applyAgentChangeset = async (
  agent: TAgentContext,
  projectId: unknown,
  input: TChangesetRequest,
): Promise<TAgentChangesetResult> => {
  const project = await resolveProject(
    agent,
    projectId,
    EAgentScope.CONTENT_READ,
  );
  assertWritable(project);
  await runAgentAccessGuard({
    user_id: agent.user_id,
    org_id: project.org_id,
    project_id: project.project_id,
    project_owner_id: project.user_id,
    write: true,
  });
  if (
    ![
      EAgentScope.CONTENT_WRITE,
      EAgentScope.MEDIA_WRITE,
      EAgentScope.SCHEMA_WRITE,
      EAgentScope.CODE_WRITE,
    ].some((s) => agent.scopes.has(s))
  ) {
    throw new ApiError("This agent has read-only access", 403, "");
  }
  if (typeof input.message !== "string" || !input.message.trim()) {
    throw new ApiError("A commit message is required", 400, "");
  }

  if (!input.dry_run) assertCommitBudget(agent.grant.grant_id);
  const mainClient = await createProjectGitClient(project, agent.user_id);
  const mainHead = await requireHead(mainClient);
  const siteConfig = await readSiteConfig(mainClient, mainHead);
  const roots = rootsFromConfig(siteConfig);
  const policy = policyFor(agent.scopes, roots);

  const branch = resolveTargetBranch(agent, project, input);
  let client = mainClient;
  if (branch) {
    if (!input.dry_run) await mainClient.createBranch(branch, mainHead);
    client = await createProjectGitClient(project, agent.user_id, branch);
  }

  const message = buildCommitMessage({
    message: input.message,
    description: input.description,
    trailers: [
      ["Sitepins-User", agent.user_name],
      ["Sitepins-Agent", agent.client_name],
    ],
  });

  let result: TApplyChangesetResult;
  try {
    result = await applyChangeset(
      branch && input.dry_run ? mainClient : client,
      {
        baseCommit: input.base_commit,
        expectedShas: input.expected_shas,
        changes: input.changes,
        message,
        author: gitAuthor(project),
        policy,
        dryRun: input.dry_run,
      },
    );
  } catch (error) {
    if (error instanceof ChangesetPolicyError) {
      const violations = error.violations.map((v) =>
        v.reason.startsWith("outside")
          ? {
              ...v,
              reason: `needs the ${scopeForPath(v.path, roots)} permission`,
            }
          : v,
      );
      throw Object.assign(
        new ApiError(
          `${violations.length} path(s) can't be written: ${violations.map((v) => `${v.path} (${v.reason})`).join("; ")}`,
          error.status,
          "",
        ),
        { code: error.code, violations },
      );
    }
    if (error instanceof GitEngineError) {
      throw Object.assign(new ApiError(error.message, error.status, ""), {
        code: error.code,
      });
    }
    throw error;
  }

  const targetBranch = branch ?? project.branch;
  if (result.status !== "committed") return { ...result, branch: targetBranch };

  let pull_request: TAgentChangesetResult["pull_request"];
  if (branch) {
    pull_request = await mainClient
      .openPullRequest({
        head: branch,
        title: input.message.trim().slice(0, 200),
        body: `${input.description ? `${input.description}\n\n` : ""}Proposed by ${agent.client_name} for ${agent.user_name} via Sitepins.`,
      })
      .catch((error: unknown) => {
        logger.error("[agents] opening pull request failed", error);
        return undefined;
      });
  }

  await recordCommit(
    agent,
    project,
    result,
    roots,
    siteConfig,
    Boolean(branch),
  );
  return {
    ...result,
    branch: targetBranch,
    ...(pull_request && { pull_request }),
  };
};

const recordCommit = async (
  agent: TAgentContext,
  project: TProjectType,
  result: Extract<TApplyChangesetResult, { status: "committed" }>,
  roots: TProjectRoots,
  siteConfig: TSiteConfig | null,
  onSideBranch: boolean,
) => {
  // Activity and open editors follow the project branch; side-branch work shows up in its pull request.
  if (onSideBranch) return;
  try {
    await ProjectLog.insertMany(
      result.changes.map((change) => ({
        project_id: project.project_id,
        user_id: agent.user_id,
        file: change.path,
        file_type: logTypeFor(change.path, roots, siteConfig),
        action: logAction(
          change.op,
          change.op === "upsert" && Boolean(change.existed),
        ),
        via: agent.client_name,
      })),
    );
  } catch (error) {
    logger.error("[agents] activity log write failed", error);
  }
  broadcastExternalCommit(
    project.org_id,
    project.project_id,
    result.changes.map((change) => ({
      file: change.path,
      action: change.op === "delete" ? "delete" : "update",
      user_id: agent.user_id,
      user_name: agent.user_name,
      via: agent.client_name,
      commit_sha: result.commitSha,
    })),
  );
};
