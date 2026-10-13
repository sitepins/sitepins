import brand from "@/config/brand";
import {
  configPaths,
  isConfigDirPath,
  isSchemaDirPath,
  isSnippetDirPath,
} from "@/lib/configDir";
import config from "@/config/variables";
import ApiError from "@/errors/ApiError";
import {
  applyChangeset,
  buildCommitMessage,
  ChangesetPolicyError,
  gitBlobSha,
  TApplyChangesetResult,
  TChangesetChange,
} from "@/lib/git-engine/changeset";
import { GitEngineError } from "@/lib/git-engine/errors";
import { normalizeRepoPath, TPathPolicy } from "@/lib/git-engine/path-policy";
import { TGitClient, TGitFile } from "@/lib/git-engine/types";
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
import {
  issueGitReadToken,
  issueUploadTicket,
  requireScope,
  TUploadClaims,
} from "./agent.auth";
import { agentCache, forgetHead, TCachedGitClient } from "./agent.cache";
import {
  createCachedProjectGitClient,
  createProjectGitClient,
  getProjectToken,
  isGitLabProject,
} from "./agent.git";
import {
  checkEntryFields,
  defaultsFromTemplate,
  missingRequired,
  parseFieldPath,
  readFields,
  serializeEntry,
  TDocFormat,
  TFieldChanges,
  TTemplateField,
  updateFields,
} from "./agent.fields";
import { unifiedDiff } from "./agent.diff";
import { globToRegExp } from "./agent.glob";
import { closestLines, closestPaths } from "./agent.suggest";
import { agentError, canWrite, EToolErrorCode } from "./agent.tools";
import {
  AGENT_SCOPE_LABELS,
  EAgentScope,
  EAgentWriteMode,
  EContextPart,
  TAgentContext,
} from "./agent.type";

/** Site config path for new sites. A repo may use the legacy folder instead. */
export const SITE_CONFIG_PATH = configPaths().config;
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
  /** New blob sha per written path (null: removed); the expected_sha for the next write. */
  files?: { path: string; sha: string | null }[];
  next_step: string;
};

export const CONFLICT_HINT =
  "Someone changed these files. Re-read them, merge your edit, and retry with the new expected_sha.";

const NEXT_STEP = {
  saved: "Saved. Use get_deploy_status to see when it's live.",
  pullRequest: "Share pull_request.url; it goes live after merging.",
  noPullRequest:
    "Saved on a separate branch, but the pull request couldn't be opened; tell the user it isn't live yet.",
  noop: "Nothing changed; the file already had this.",
  dryRun: "Show the preview and confirm, then call again without dry_run.",
};

// GitLab has no app identity, so agent commits carry the brand's bot name.
const GITLAB_AUTHOR = { name: brand.bot_name, email: brand.bot_email };

const USER_TRAILER = `${brand.commit_trailer_prefix}-User`;
const AGENT_TRAILER = `${brand.commit_trailer_prefix}-Agent`;

const gitAuthor = (project: TProjectType) =>
  isGitLabProject(project)
    ? GITLAB_AUTHOR
    : // GitHub attributes installation-token commits to the app itself.
      undefined;

/** The one site a single-site grant can reach, so project_id can be left out. */
export const onlyProjectId = (agent: TAgentContext) =>
  !agent.grant.all_projects && agent.grant.project_ids.length === 1
    ? agent.grant.project_ids[0]
    : undefined;

const unknownProject = async (agent: TAgentContext, given: unknown) => {
  let projects: TProjectType[] = [];
  try {
    projects =
      (await Project.find({
        org_id: agent.grant.org_id,
        ...(!agent.grant.all_projects && {
          project_id: { $in: agent.grant.project_ids },
        }),
      })
        .select("project_id project_name")
        .lean<TProjectType[]>()) ?? [];
  } catch (error) {
    logger.error(
      "[agents] listing projects for a not-found error failed",
      error,
    );
  }
  return agentError(
    given === undefined
      ? "project_id is required"
      : "Project not found or not shared with this agent",
    given === undefined ? 400 : 404,
    given === undefined
      ? EToolErrorCode.INVALID_INPUT
      : EToolErrorCode.NOT_FOUND,
    {
      fix: "Use a project_id from projects (or list_projects); ask the user which site if unclear.",
      details: {
        projects: projects.slice(0, 50).map((p) => ({
          project_id: p.project_id,
          name: p.project_name,
        })),
      },
    },
  );
};

export const resolveProject = async (
  agent: TAgentContext,
  given: unknown,
  scope: EAgentScope,
  { write = false }: { write?: boolean } = {},
): Promise<TProjectType> => {
  requireScope(agent, scope);
  const projectId = given ?? onlyProjectId(agent);
  if (
    typeof projectId !== "string" ||
    !(agent.grant.all_projects || agent.grant.project_ids.includes(projectId))
  ) {
    throw await unknownProject(agent, projectId);
  }
  const project = await Project.findOne({
    project_id: projectId,
  }).lean<TProjectType>();
  if (!project || project.org_id !== agent.grant.org_id) {
    throw await unknownProject(agent, projectId);
  }
  await runAgentAccessGuard({
    user_id: agent.user_id,
    org_id: project.org_id,
    project_id: project.project_id,
    project_owner_id: project.user_id,
    write,
  });
  return project;
};

const assertWritable = (project: TProjectType) => {
  if (project.status === "archived") {
    throw agentError("This project is archived", 403, EToolErrorCode.ARCHIVED, {
      fix: "Tell the user; the site has to be restored in the app before it can be changed.",
    });
  }
};

const blobPaths = async (reader: TCachedGitClient, ref: string) =>
  (await reader.readTree(ref).catch(() => ({ entries: [] }))).entries
    .filter((e) => e.type === "blob")
    .map((e) => e.path);

/** Not-found with the nearest real paths, from the (usually cached) tree. */
const missingFile = async (
  reader: TCachedGitClient,
  ref: string,
  path: string,
) => {
  const suggestions = closestPaths(path, await blobPaths(reader, ref));
  return agentError(`${path} doesn't exist`, 404, EToolErrorCode.NOT_FOUND, {
    fix: suggestions.length
      ? "Use a path from did_you_mean, or find it with list_files or search_content."
      : "Find the file with list_files or search_content.",
    ...(suggestions.length && { details: { did_you_mean: suggestions } }),
  });
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
  schema: [configPaths().schema, configPaths().snippet],
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
  if (isSchemaDirPath(path)) return EProjectLogType.SCHEMA;
  if (isSnippetDirPath(path)) return EProjectLogType.SNIPPET;
  if (isConfigDirPath(path)) return EProjectLogType.CONFIG;
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
  const file = await client.readFile(ref, configPaths().config);
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

const projectSummary = (p: TProjectType) => ({
  project_id: p.project_id,
  name: p.project_name,
  provider: p.provider,
  repository: p.repository,
  branch: p.branch,
  generator: p.generator,
  site_url: p.site_url,
  archived: p.status === "archived",
});

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
  // Minting a repository token takes seconds; start it now so the agent's next call doesn't wait.
  for (const p of allowed.filter((p) => p.status !== "archived").slice(0, 5)) {
    getProjectToken(p.project_id, agent.user_id).catch(() => undefined);
  }
  return allowed.map(projectSummary);
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

type TEditHints = {
  settings: string[];
  styles: string[];
  templates: string[];
};

type TFullContext = {
  head: string;
  editHints: TEditHints;
  siteConfig: TSiteConfig | null;
  roots: TProjectRoots;
  schemas: TSchemaSummary[];
  contentFiles: string[];
  folders: { path: string; files: number }[];
  repositoryFiles: number;
  truncated: boolean;
  devCommand?: string;
};

const BINARY_EXTENSION =
  /\.(png|jpe?g|gif|webp|avif|ico|bmp|tiff?|pdf|zip|gz|tgz|woff2?|ttf|otf|eot|mp[34]|mov|webm|wav|ogg|psd|ai|sketch|exe|dll|so|wasm|lock|map)$/i;
const NOT_SEARCHED =
  /(^|\/)(node_modules|dist|build|\.next|\.astro|\.nuxt|\.output|vendor|\.git)\/|(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?)$/;
const SUMMARY_FOLDERS = 15;
const MAX_HINTS = 20;
const SETTINGS_FILE = /\.(json|ya?ml|toml)$/i;
const STYLE_FILE =
  /(^|\/)(tailwind\.config\.[cm]?[jt]s|theme\.json)$|\.(css|scss|sass|less)$/i;
const TEMPLATE_DIR =
  /(^|\/)(layouts?|components|partials|sections|templates|pages)$/;

const foldersOf = (files: string[]) => {
  const dirs = new Set<string>();
  for (const file of files) {
    for (let i = file.indexOf("/"); i !== -1; i = file.indexOf("/", i + 1)) {
      dirs.add(file.slice(0, i));
    }
  }
  return [...dirs].sort();
};

/** Where plain-language requests usually land: site settings, colours and fonts, and page building blocks. */
const editHintsFor = (
  files: string[],
  dirs: string[],
  siteConfig: TSiteConfig | null,
): TEditHints => {
  const configRoots = (siteConfig?.configs ?? [])
    .map(cleanRoot)
    .filter((r): r is string => Boolean(r));
  const vendored = (p: string) => NOT_SEARCHED.test(p);
  const contentRoots = rootsFromConfig(siteConfig).content;
  return {
    settings: files
      .filter(
        (p) => configRoots.some((r) => under(p, r)) && SETTINGS_FILE.test(p),
      )
      .slice(0, MAX_HINTS),
    styles: files
      .filter((p) => STYLE_FILE.test(p) && !vendored(p) && !under(p, "public"))
      .slice(0, MAX_HINTS),
    templates: dirs
      .filter(
        (d) =>
          TEMPLATE_DIR.test(d) &&
          !vendored(`${d}/`) &&
          !contentRoots.some((r) => under(d, r)),
      )
      .slice(0, 10),
  };
};

const buildContext = async (
  client: TCachedGitClient,
  project: TProjectType,
  head: string,
): Promise<TFullContext> => {
  const siteConfig = await readSiteConfig(client, head);
  const roots = rootsFromConfig(siteConfig);
  const { entries, truncated } = await client.readTree(head);
  const files = entries.filter((e) => e.type === "blob").map((e) => e.path);

  const schemaPaths = files
    .filter((p) => under(p, configPaths().schema) && p.endsWith(".json"))
    .slice(0, 50);
  const toRead = [
    ...schemaPaths,
    ...(files.includes("package.json") ? ["package.json"] : []),
  ];
  const read = toRead.length
    ? await client.readFiles(head, toRead)
    : new Map<string, TGitFile | null>();
  const schemas = schemaPaths
    .map((path) => {
      const file = read.get(path);
      return file
        ? summarizeSchema(path, file.content.toString("utf-8"))
        : null;
    })
    .filter((s): s is TSchemaSummary => Boolean(s));

  const contentFiles = files.filter((p) =>
    roots.content.some((r) => under(p, r)),
  );
  const folderCounts = new Map<string, number>();
  for (const path of contentFiles) {
    const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
    folderCounts.set(dir, (folderCounts.get(dir) ?? 0) + 1);
  }
  const packageJson =
    read.get("package.json")?.content.toString("utf-8") ?? null;

  return {
    head,
    editHints: editHintsFor(files, foldersOf(files), siteConfig),
    siteConfig,
    roots,
    schemas,
    contentFiles,
    folders: [...folderCounts]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 50)
      .map(([path, count]) => ({ path, files: count })),
    repositoryFiles: files.length,
    truncated,
    devCommand: detectDevCommand(project.generator, packageJson),
  };
};

export const getProjectContext = async (
  agent: TAgentContext,
  projectId: unknown,
  include: readonly EContextPart[] = [],
) => {
  const project = await resolveProject(
    agent,
    projectId,
    EAgentScope.CONTENT_READ,
  );
  const client = await createCachedProjectGitClient(project, agent.user_id);
  const head = await requireHead(client);
  const key = `${project.project_id}@${head}`;
  let context = agentCache.getContext<TFullContext>(key);
  if (!context) {
    context = await buildContext(client, project, head);
    agentCache.setContext(key, context);
  }
  const wants = (part: EContextPart) => include.includes(part);
  const policy = policyFor(agent.scopes, context.roots);

  return {
    project: projectSummary(project),
    head_commit: head,
    roots: context.roots,
    schemas: wants(EContextPart.SCHEMAS)
      ? context.schemas
      : context.schemas.map((s) => ({
          name: s.name,
          path: s.path,
          file: s.file,
        })),
    content: {
      total_files: context.contentFiles.length,
      folders: wants(EContextPart.FOLDERS)
        ? context.folders
        : context.folders.slice(0, SUMMARY_FOLDERS),
      ...(wants(EContextPart.SAMPLES) && {
        samples: context.contentFiles.slice(0, 20),
      }),
    },
    where_to_edit: {
      ...context.editHints,
      note: "settings: site name, menus, social links and similar; styles: colours, fonts and spacing; templates: page sections such as headers and banners. Find the exact spot with search_content.",
    },
    ...(wants(EContextPart.CONFIG) && { site_config: context.siteConfig }),
    repository_files: context.repositoryFiles,
    tree_truncated: context.truncated,
    dev_command: context.devCommand,
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
    notes: context.siteConfig
      ? undefined
      : `${SITE_CONFIG_PATH} is missing, so content and media folders are unknown. Writes need code:write until the project is opened in ${brand.name} once.`,
  };
};

export const getSchema = async (
  agent: TAgentContext,
  projectId: unknown,
  name: string,
) => {
  const project = await resolveProject(
    agent,
    projectId,
    EAgentScope.CONTENT_READ,
  );
  const client = await createCachedProjectGitClient(project, agent.user_id);
  const head = await requireHead(client);
  const schemaDir = configPaths().schema;
  const { entries } = await client.readTree(head, schemaDir);
  const paths = entries
    .filter((e) => e.type === "blob" && e.path.endsWith(".json"))
    .map((e) => e.path);
  const byPath = paths.find(
    (p) => p === name || p === `${schemaDir}/${name}.json`,
  );
  const candidates = byPath ? [byPath] : paths;
  const files = await client.readFiles(head, candidates);
  const names: string[] = [];
  for (const path of candidates) {
    const raw = files.get(path)?.content.toString("utf-8");
    if (!raw) continue;
    let schema: unknown;
    try {
      schema = JSON.parse(raw);
    } catch {
      continue;
    }
    const schemaName = (schema as { name?: unknown }).name;
    if (byPath || schemaName === name) {
      return { path, sha: files.get(path)!.sha, schema };
    }
    names.push(typeof schemaName === "string" ? schemaName : path);
  }
  throw unknownSchema(name, names);
};

const unknownSchema = (name: string, schemas: string[]) =>
  agentError(`No schema named ${name}`, 404, EToolErrorCode.NOT_FOUND, {
    fix: schemas.length
      ? "Use one of schemas (also listed by get_project_context)."
      : "This site has no schemas; pass a folder instead.",
    details: { schemas },
  });

const DEFAULT_LIST_LIMIT = 500;
const MAX_LIST_LIMIT = 2000;
const MAX_LISTED_DIRS = 200;

export const listFiles = async (
  agent: TAgentContext,
  projectId: unknown,
  options: {
    path?: string;
    ref?: string;
    glob?: string;
    limit?: number;
    cursor?: string;
    include_sha?: boolean;
  },
) => {
  const project = await resolveProject(
    agent,
    projectId,
    EAgentScope.CONTENT_READ,
  );
  const client = await createCachedProjectGitClient(project, agent.user_id);
  const ref = options.ref || (await requireHead(client));
  const dir = options.path ? normalizeRepoPath(options.path) : undefined;
  const { entries, truncated } = await client.readTree(ref, dir);
  const pattern = options.glob ? globToRegExp(options.glob) : undefined;
  const relative = (path: string) => (dir ? path.slice(dir.length + 1) : path);
  const files = entries
    .filter(
      (e) =>
        e.type === "blob" &&
        (!pattern || pattern.test(relative(e.path)) || pattern.test(e.path)),
    )
    .sort((a, b) => a.path.localeCompare(b.path));
  const limit = Math.min(
    Math.max(Number(options.limit) || DEFAULT_LIST_LIMIT, 1),
    MAX_LIST_LIMIT,
  );
  const offset = Math.max(Number(options.cursor) || 0, 0);
  const page = files.slice(offset, offset + limit);
  const dirs =
    offset === 0 && !pattern
      ? entries
          .filter((e) => e.type === "tree")
          .map((e) => e.path)
          .sort()
      : [];
  return {
    ref,
    path: dir ?? "",
    total_files: files.length,
    files: options.include_sha
      ? page.map((e) => ({ path: e.path, sha: e.sha }))
      : page.map((e) => e.path),
    ...(dirs.length && {
      dirs: dirs.slice(0, MAX_LISTED_DIRS),
      ...(dirs.length > MAX_LISTED_DIRS && { dirs_truncated: true }),
    }),
    ...(offset + limit < files.length && {
      next_cursor: String(offset + limit),
    }),
    ...(truncated && { tree_truncated: true }),
  };
};

const describeFile = (path: string, ref: string, file: TGitFile) => {
  const isText = !file.content.subarray(0, 8000).includes(0);
  const tooBig = file.content.length > MAX_READ_BYTES;
  return {
    path,
    ref,
    sha: file.sha,
    bytes: file.content.length,
    encoding: isText ? "utf-8" : "base64",
    content: tooBig ? null : file.content.toString(isText ? "utf-8" : "base64"),
    ...(tooBig && { truncated: true }),
  };
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
  const client = await createCachedProjectGitClient(project, agent.user_id);
  const ref = options.ref || (await requireHead(client));
  const file = await client.readFile(ref, path);
  if (!file) throw await missingFile(client, ref, path);
  return describeFile(path, ref, file);
};

const MAX_BATCH_BYTES = 4 * 1024 * 1024;

export const readFiles = async (
  agent: TAgentContext,
  projectId: unknown,
  options: { paths: unknown[]; ref?: string },
) => {
  const project = await resolveProject(
    agent,
    projectId,
    EAgentScope.CONTENT_READ,
  );
  const paths = [...new Set(options.paths.map((p) => normalizeRepoPath(p)))];
  const client = await createCachedProjectGitClient(project, agent.user_id);
  const ref = options.ref || (await requireHead(client));
  const read = await client.readFiles(ref, paths);
  const existing = paths.some((p) => !read.get(p))
    ? await blobPaths(client, ref)
    : [];
  let budget = MAX_BATCH_BYTES;
  return {
    ref,
    files: paths.map((path) => {
      const file = read.get(path);
      if (!file) {
        const suggestions = closestPaths(path, existing);
        return {
          path,
          error: "not found",
          code: EToolErrorCode.NOT_FOUND,
          ...(suggestions.length && { did_you_mean: suggestions }),
        };
      }
      if (file.content.length > budget) {
        return {
          path,
          sha: file.sha,
          bytes: file.content.length,
          error: "response size limit reached; read this file on its own",
        };
      }
      budget -= file.content.length;
      return describeFile(path, ref, file);
    }),
  };
};

const MAX_SEARCH_FILES = 1500;
const MAX_LINE_PREVIEW = 200;

type TSearchMatch = { path: string; line: number; text: string };

export enum ESearchArea {
  CONTENT = "content",
  SITE = "site",
  PATH = "path",
}

const scanFiles = async (
  client: TCachedGitClient,
  head: string,
  paths: string[],
  options: { query: string; case_sensitive?: boolean; limit: number },
) => {
  const needle = options.case_sensitive
    ? options.query
    : options.query.toLowerCase();
  const files = await client.readFiles(head, paths);
  const matches: TSearchMatch[] = [];
  for (const path of paths) {
    const file = files.get(path);
    if (!file || file.content.subarray(0, 8000).includes(0)) continue;
    const lines = file.content.toString("utf-8").split("\n");
    for (const [i, line] of lines.entries()) {
      const hay = options.case_sensitive ? line : line.toLowerCase();
      if (!hay.includes(needle)) continue;
      if (matches.length >= options.limit) return { matches, more: true };
      matches.push({
        path,
        line: i + 1,
        text: line.trim().slice(0, MAX_LINE_PREVIEW),
      });
    }
  }
  return { matches, more: false };
};

/**
 * Plain-language requests ("make the banner red") name things that may live in
 * content or in templates and styles, so with no path this searches the
 * content folders first and widens to the whole site when they have no match.
 */
export const searchContent = async (
  agent: TAgentContext,
  projectId: unknown,
  options: {
    query: string;
    path?: string;
    glob?: string;
    case_sensitive?: boolean;
    limit?: number;
  },
) => {
  const project = await resolveProject(
    agent,
    projectId,
    EAgentScope.CONTENT_READ,
  );
  if (!options.query) throw new ApiError("query is required", 400, "");
  const client = await createCachedProjectGitClient(project, agent.user_id);
  const head = await requireHead(client);
  const roots = rootsFromConfig(await readSiteConfig(client, head));
  const dir = options.path ? normalizeRepoPath(options.path) : undefined;
  const pattern = options.glob ? globToRegExp(options.glob) : undefined;
  const { entries } = await client.readTree(head);
  const searchable = entries
    .filter(
      (e) =>
        e.type === "blob" &&
        !BINARY_EXTENSION.test(e.path) &&
        !NOT_SEARCHED.test(e.path) &&
        (!pattern || pattern.test(e.path)),
    )
    .map((e) => e.path);
  const limit = Math.min(Math.max(Number(options.limit) || 25, 1), 200);
  const inDirs = (dirs: string[]) =>
    searchable.filter((p) => dirs.some((d) => under(p, d)));

  const areas: { area: ESearchArea; label: string[]; paths: string[] }[] = dir
    ? [{ area: ESearchArea.PATH, label: [dir], paths: inDirs([dir]) }]
    : roots.content.length
      ? [
          {
            area: ESearchArea.CONTENT,
            label: roots.content,
            paths: inDirs(roots.content),
          },
          {
            area: ESearchArea.SITE,
            label: ["(rest of the site: templates, styles, settings)"],
            paths: searchable.filter(
              (p) => !roots.content.some((d) => under(p, d)),
            ),
          },
        ]
      : [
          {
            area: ESearchArea.SITE,
            label: ["(whole site)"],
            paths: searchable,
          },
        ];

  // Both areas are reported: "make the banner red" needs the banner's text (content) and its template or styles (site).
  const searchedIn: string[] = [];
  let filesSearched = 0;
  let skipped = 0;
  const found: (TSearchMatch & { area: ESearchArea })[] = [];
  let more = false;
  for (const area of areas) {
    const batch = area.paths.slice(0, MAX_SEARCH_FILES);
    skipped += area.paths.length - batch.length;
    searchedIn.push(...area.label);
    filesSearched += batch.length;
    const scanned = await scanFiles(client, head, batch, {
      query: options.query,
      case_sensitive: options.case_sensitive,
      limit,
    });
    found.push(...scanned.matches.map((m) => ({ ...m, area: area.area })));
    more ||= scanned.more;
  }
  const result = { matches: found, more };

  const policy = policyFor(agent.scopes, roots);
  const canEdit = (path: string) =>
    policy.writableRoots === "all" ||
    policy.writableRoots.some((r) => under(path, r));
  const blocked = [
    ...new Set(
      result.matches
        .filter((m) => !canEdit(m.path))
        .map((m) => scopeForPath(m.path, roots)),
    ),
  ];
  return {
    ref: head,
    searched_in: searchedIn,
    files_searched: filesSearched,
    matches: result.matches.map((m) => ({ ...m, can_edit: canEdit(m.path) })),
    ...(result.more && { more_matches: true }),
    ...(blocked.length && {
      permission_hint: `Some matches can't be changed with this token. The user can turn on ${blocked.map((s) => `"${AGENT_SCOPE_LABELS[s]}"`).join(" and ")} for it in ${brand.name} → Settings → MCP Connection.`,
    }),
    ...(skipped > 0 && {
      files_skipped: skipped,
      hint: "Too many files to search at once; narrow it with path or glob.",
    }),
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
  `${brand.agent_branch_prefix}agent-${new Date().toISOString().slice(0, 10)}-${Math.random().toString(36).slice(2, 7)}`;

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
  if (forced && !branch.startsWith(brand.agent_branch_prefix)) {
    throw new ApiError(
      `This agent may only push to branches under ${brand.agent_branch_prefix}`,
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
    const retry = Math.max(
      1,
      Math.ceil((Math.min(...recent) + COMMIT_WINDOW_MS - Date.now()) / 1000),
    );
    throw agentError(
      "Too many commits. Try again in a few minutes.",
      429,
      EToolErrorCode.RATE_LIMITED,
      {
        fix: "Wait retry_after_seconds, or combine several edits into one write_files call.",
        details: { retry_after_seconds: retry },
      },
    );
  }
  recentCommits.set(grantId, [...recent, Date.now()]);
};

export const applyAgentChangeset = async (
  agent: TAgentContext,
  projectId: unknown,
  input: TChangesetRequest,
): Promise<TAgentChangesetResult> => {
  const project = await resolveWritableProject(agent, projectId);
  const deletes = input.changes.filter((c) => c.op === "delete");
  if (deletes.length && !input.base_commit) {
    const reader = await createCachedProjectGitClient(project, agent.user_id);
    const head = await requireHead(reader);
    const { entries, truncated } = await reader.readTree(head);
    const present = new Set(
      entries.filter((e) => e.type === "blob").map((e) => e.path),
    );
    const missing = truncated
      ? undefined
      : deletes.find((c) => !present.has(normalizeRepoPath(c.path)));
    if (missing) {
      throw await missingFile(reader, head, normalizeRepoPath(missing.path));
    }
  }
  return commitChangeset(agent, project, input);
};

const resolveWritableProject = async (
  agent: TAgentContext,
  projectId: unknown,
) => {
  const project = await resolveProject(
    agent,
    projectId,
    EAgentScope.CONTENT_READ,
    { write: true },
  );
  assertWritable(project);
  if (!canWrite(agent)) {
    throw agentError(
      "This agent has read-only access",
      403,
      EToolErrorCode.READ_ONLY,
      {
        fix: `Tell the user; they can turn on "${AGENT_SCOPE_LABELS[EAgentScope.CONTENT_WRITE]}" in ${brand.name} → Settings → MCP Connection.`,
      },
    );
  }
  return project;
};

const commitChangeset = async (
  agent: TAgentContext,
  project: TProjectType,
  input: TChangesetRequest,
): Promise<TAgentChangesetResult> => {
  if (typeof input.message !== "string" || !input.message.trim()) {
    throw new ApiError("A commit message is required", 400, "");
  }

  if (!input.dry_run) assertCommitBudget(agent.grant.grant_id);
  const mainClient = await createProjectGitClient(project, agent.user_id);
  const mainHead = await requireHead(mainClient);
  const siteConfig = await readSiteConfig(
    await createCachedProjectGitClient(project, agent.user_id),
    mainHead,
  );
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
      [USER_TRAILER, agent.user_name],
      [AGENT_TRAILER, agent.client_name],
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
              reason: `needs the ${scopeForPath(v.path, roots)} permission ("${AGENT_SCOPE_LABELS[scopeForPath(v.path, roots)]}" in ${brand.name} → Settings → MCP Connection)`,
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
  if (result.status !== "committed") {
    return {
      ...result,
      branch: targetBranch,
      next_step:
        result.status === "conflict"
          ? CONFLICT_HINT
          : result.status === "noop"
            ? NEXT_STEP.noop
            : NEXT_STEP.dryRun,
    };
  }

  let pull_request: TAgentChangesetResult["pull_request"];
  if (branch) {
    pull_request = await mainClient
      .openPullRequest({
        head: branch,
        title: input.message.trim().slice(0, 200),
        body: `${input.description ? `${input.description}\n\n` : ""}Proposed by ${agent.client_name} for ${agent.user_name} via ${brand.name}.`,
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
  const written = new Map<string, Buffer>();
  for (const change of input.changes) {
    if (change.op === "upsert" || (change.op === "rename" && change.content)) {
      written.set(normalizeRepoPath(change.path), change.content!);
    }
  }
  return {
    ...result,
    branch: targetBranch,
    ...(pull_request && { pull_request }),
    files: result.changes.map((c) => {
      const content = written.get(c.path);
      return {
        path: c.path,
        sha: c.op === "delete" || !content ? null : gitBlobSha(content),
      };
    }),
    next_step: !branch
      ? NEXT_STEP.saved
      : pull_request
        ? NEXT_STEP.pullRequest
        : NEXT_STEP.noPullRequest,
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
  forgetHead(project.project_id);
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

export type TTextEdit = {
  old_string: string;
  new_string: string;
  replace_all?: boolean;
};

const countOccurrences = (text: string, needle: string) => {
  let count = 0;
  for (
    let i = text.indexOf(needle);
    i !== -1;
    i = text.indexOf(needle, i + needle.length)
  ) {
    count++;
  }
  return count;
};

export const applyTextEdits = (
  path: string,
  text: string,
  edits: TTextEdit[],
) => {
  let out = text;
  for (const [i, edit] of edits.entries()) {
    if (!edit.old_string) {
      throw new ApiError(
        `${path}: edit ${i + 1} has an empty old_string`,
        400,
        "",
      );
    }
    const count = countOccurrences(out, edit.old_string);
    if (count === 0) {
      const closest = closestLines(out, edit.old_string);
      throw agentError(
        `${path}: edit ${i + 1} old_string was not found. Re-read the file; it may have changed.`,
        409,
        EToolErrorCode.NO_MATCH,
        {
          fix: "Copy old_string exactly from read_files (or from closest), including spaces and quotes.",
          ...(closest.length && { details: { closest } }),
        },
      );
    }
    if (count > 1 && !edit.replace_all) {
      throw agentError(
        `${path}: edit ${i + 1} old_string matches ${count} times. Add surrounding text to make it unique, or set replace_all.`,
        409,
        EToolErrorCode.AMBIGUOUS,
        {
          fix: "Include a neighbouring line in old_string, or set replace_all.",
        },
      );
    }
    out = edit.replace_all
      ? out.split(edit.old_string).join(edit.new_string)
      : out.replace(edit.old_string, () => edit.new_string);
  }
  return out;
};

/** Find-and-replace inside one file, committed by the bot, without sending the whole file back. */
export const editFile = async (
  agent: TAgentContext,
  projectId: unknown,
  input: {
    path: unknown;
    edits: TTextEdit[];
    message: string;
    description?: string;
    expected_sha?: string;
    dry_run?: boolean;
    branch?: string;
    open_pr?: boolean;
  },
) => {
  const project = await resolveWritableProject(agent, projectId);
  const path = normalizeRepoPath(input.path);
  if (!input.edits.length) throw new ApiError("No edits given", 400, "");
  const head = await requireHead(
    await createProjectGitClient(project, agent.user_id),
  );
  const reader = await createCachedProjectGitClient(project, agent.user_id);
  const file = await reader.readFile(head, path);
  if (!file) throw await missingFile(reader, head, path);
  if (file.content.subarray(0, 8000).includes(0)) {
    throw new ApiError(`${path} is binary; use write_files`, 400, "");
  }
  const before = file.content.toString("utf-8");
  const after = applyTextEdits(path, before, input.edits);
  const result = await commitChangeset(agent, project, {
    message: input.message,
    description: input.description,
    expected_shas: { [path]: input.expected_sha ?? file.sha },
    dry_run: input.dry_run,
    branch: input.branch,
    open_pr: input.open_pr,
    changes: [{ op: "upsert", path, content: Buffer.from(after, "utf-8") }],
  });
  return { ...result, path };
};

/** Rename or move one file; expected_sha defaults to the file's current sha. */
export const moveFile = async (
  agent: TAgentContext,
  projectId: unknown,
  input: TWriteOptions & {
    from: unknown;
    to: unknown;
    message: string;
    expected_sha?: string;
  },
) => {
  const project = await resolveWritableProject(agent, projectId);
  const from = normalizeRepoPath(input.from);
  const to = normalizeRepoPath(input.to);
  const head = await requireHead(
    await createProjectGitClient(project, agent.user_id),
  );
  const reader = await createCachedProjectGitClient(project, agent.user_id);
  const file = await reader.readFile(head, from);
  if (!file) throw await missingFile(reader, head, from);
  const result = await commitChangeset(agent, project, {
    message: input.message,
    description: input.description,
    expected_shas: { [from]: input.expected_sha ?? file.sha, [to]: null },
    dry_run: input.dry_run,
    branch: input.branch,
    open_pr: input.open_pr,
    changes: [{ op: "rename", from, path: to, content: file.content }],
  });
  return { ...result, from, to };
};

const MAX_UNDO_FILES = 100;
const UNDO_LOOKBACK = 30;

const trailerValue = (value: string) => value.replace(/\s+/g, " ").trim();

/** "Undo that": the newest commit on the branch this token made, matched by its trailers. */
const lastChangeBy = async (agent: TAgentContext, client: TGitClient) => {
  const mine = [
    `${AGENT_TRAILER}: ${trailerValue(agent.client_name)}`,
    `${USER_TRAILER}: ${trailerValue(agent.user_name)}`,
  ];
  const commits = await client.listCommits({ limit: UNDO_LOOKBACK });
  const found = commits.find((c) =>
    mine.every((line) => c.message.split("\n").includes(line)),
  );
  if (!found) {
    throw new ApiError(
      `No change made with this token in the last ${UNDO_LOOKBACK} commits. Pass commit_sha (see list_history).`,
      404,
      "",
    );
  }
  return found.sha;
};

const subjectOf = (message: string) => message.split("\n")[0].trim();

/** Puts back the files a commit touched, as a new commit; refuses if they changed again since. */
export const undoChange = async (
  agent: TAgentContext,
  projectId: unknown,
  input: {
    commit_sha?: string;
    message?: string;
    description?: string;
    dry_run?: boolean;
    branch?: string;
    open_pr?: boolean;
  },
) => {
  const project = await resolveWritableProject(agent, projectId);
  const raw = await createProjectGitClient(project, agent.user_id);
  const head = await requireHead(raw);
  const sha = input.commit_sha?.trim() || (await lastChangeBy(agent, raw));
  const commit = await raw.readCommit(sha);
  if (!commit) {
    throw new ApiError(`Commit ${sha} not found`, 404, "");
  }
  const parent = commit.parents[0];
  if (!parent) {
    throw new ApiError(
      "The very first commit of a site can't be undone",
      400,
      "",
    );
  }
  if ((await raw.changedPaths(commit.sha, head)) === "diverged") {
    throw new ApiError(
      "That change isn't part of the site's current history, so there's nothing to undo on this branch",
      409,
      "",
    );
  }
  const touched = await raw.changedPaths(parent, commit.sha);
  if (touched === "diverged" || !touched.size) {
    throw new ApiError("That commit didn't change any files", 400, "");
  }
  if (touched.size > MAX_UNDO_FILES) {
    throw new ApiError(
      `That change touched ${touched.size} files; undo it with a developer instead`,
      413,
      "",
    );
  }
  const paths = [...touched].sort();
  const reader = await createCachedProjectGitClient(project, agent.user_id);
  const before = await reader.readFiles(parent, paths);
  const changes: TChangesetChange[] = paths.map((path) => {
    const file = before.get(path);
    return file
      ? { op: "upsert", path, content: file.content }
      : { op: "delete", path };
  });
  const subject = subjectOf(commit.message);
  const result = await commitChangeset(agent, project, {
    message: input.message?.trim() || `Undo "${subject}"`.slice(0, 200),
    description: [input.description?.trim(), `Reverts ${commit.sha}.`]
      .filter(Boolean)
      .join("\n\n"),
    // Conflicts are judged from the undone commit, so later edits to the same files are never overwritten.
    base_commit: commit.sha,
    changes,
    dry_run: input.dry_run,
    branch: input.branch,
    open_pr: input.open_pr,
  });
  return {
    ...result,
    undone: {
      commit: commit.sha,
      message: subject,
      files: changes.map((c) => ({
        path: c.path,
        action: c.op === "delete" ? "removed (it was added)" : "restored",
      })),
    },
    ...(result.status === "conflict" && {
      next_step:
        "Someone changed these files after that commit. Show the user what changed, then edit the current version instead.",
    }),
  };
};

export enum EDeployState {
  LIVE = "live",
  BUILDING = "building",
  FAILED = "failed",
  UNKNOWN = "unknown",
}

const FAILED_STATES = [
  "error",
  "failure",
  "failed",
  "canceled",
  "cancelled",
  "blocked",
];
const BUSY_STATES = [
  "pending",
  "queued",
  "in_progress",
  "running",
  "created",
  "waiting_for_resource",
  "preparing",
  "scheduled",
];

const overallState = (states: string[]): EDeployState => {
  if (!states.length) return EDeployState.UNKNOWN;
  if (states.some((s) => FAILED_STATES.includes(s))) return EDeployState.FAILED;
  if (states.some((s) => BUSY_STATES.includes(s))) return EDeployState.BUILDING;
  return states.every((s) => s === "success")
    ? EDeployState.LIVE
    : EDeployState.UNKNOWN;
};

/** Build and deploy state of a commit as the git host reports it, in words a site owner understands. */
export const getDeployStatus = async (
  agent: TAgentContext,
  projectId: unknown,
  input: { commit_sha?: string },
) => {
  const project = await resolveProject(
    agent,
    projectId,
    EAgentScope.CONTENT_READ,
  );
  const client = await createCachedProjectGitClient(project, agent.user_id);
  const head = await requireHead(client);
  const sha = input.commit_sha || head;
  const status = await client.readDeployStatus(sha);
  const state = overallState([
    ...status.checks.map((c) => c.state),
    ...status.deployments.map((d) => d.state),
  ]);
  const deployed = status.deployments.filter(
    (d) => d.state === "success" && d.url,
  );
  const liveUrl =
    project.site_url ||
    (deployed.find((d) => /prod/i.test(d.environment)) ?? deployed[0])?.url;
  const failing = status.checks.find((c) => FAILED_STATES.includes(c.state));
  const summary = {
    [EDeployState.LIVE]: `The change is built and deployed${liveUrl ? ` at ${liveUrl}` : ""}.`,
    [EDeployState.BUILDING]:
      "The site is still building or deploying; check again in a minute.",
    [EDeployState.FAILED]: `The build or deploy failed${failing?.description ? `: ${failing.description}` : ""}.${failing?.url ? ` Details: ${failing.url}` : ""} The change is saved but not live.`,
    [EDeployState.UNKNOWN]: `The hosting provider doesn't report builds to the repository, so ${brand.name} can't tell whether this change is live. It usually goes live once the host rebuilds; check the site or the host's dashboard.`,
  }[state];
  return {
    commit: sha,
    is_latest: sha === head,
    state,
    summary,
    ...(project.site_url && { site_url: project.site_url }),
    checks: status.checks,
    deployments: status.deployments,
  };
};

export enum ELocalCloneState {
  NOT_GIVEN = "unknown",
  UP_TO_DATE = "up_to_date",
  BEHIND = "behind",
  LOCAL_ONLY = "has_unsaved_local_commits",
  DIVERGED = "diverged",
}

const MAX_LISTED_CHANGES = 50;

/**
 * Ready-to-run clone and sync commands with a one-hour read-only git token, so
 * git never prompts and no long-lived token lands in .git/config. With the
 * clone's current commit it also says whether a sync is needed and what changed.
 */
export const getGitCommands = async (
  agent: TAgentContext,
  projectId: unknown,
  input: { local_head?: string },
) => {
  const project = await resolveProject(
    agent,
    projectId,
    EAgentScope.CONTENT_READ,
  );
  if (!config.base_url) {
    throw new ApiError("This server has no BASE_URL configured", 500, "");
  }
  const raw = await createProjectGitClient(project, agent.user_id);
  const head = await requireHead(raw);
  const { token, expires_at } = issueGitReadToken(agent, project.project_id);
  const url = `${config.base_url}/git/${project.project_id}.git`;
  const branch = project.branch;
  // Empty values clear any helper or header already in .git/config, so a stale token can't interfere.
  const git = `GIT_TERMINAL_PROMPT=0 git -c credential.helper= -c http.extraHeader= -c "http.extraHeader=Authorization: Bearer ${token}"`;
  const dir = project.project_name.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  let state = ELocalCloneState.NOT_GIVEN;
  let changed: string[] | undefined;
  const local = input.local_head?.trim();
  if (local) {
    if (local === head) state = ELocalCloneState.UP_TO_DATE;
    else if (!(await raw.readCommit(local).catch(() => null))) {
      state = ELocalCloneState.LOCAL_ONLY;
    } else {
      const paths = await raw.changedPaths(local, head);
      if (paths === "diverged") state = ELocalCloneState.DIVERGED;
      else {
        state = ELocalCloneState.BEHIND;
        changed = [...paths].sort();
      }
    }
  }

  const next = {
    [ELocalCloneState.NOT_GIVEN]:
      "Run clone for a new copy. For an existing clone, call again with local_head (the output of git rev-parse HEAD) to see whether it needs a sync.",
    [ELocalCloneState.UP_TO_DATE]:
      "The local copy already matches the site. Nothing to do.",
    [ELocalCloneState.BEHIND]: `Run sync once from the clone's folder. It fetches and rebases; local commits that were already saved through ${brand.name} are dropped automatically.`,
    [ELocalCloneState.LOCAL_ONLY]: `The clone has commits ${brand.name} hasn't saved. Save them with write_files (base_commit: git merge-base HEAD origin/${branch}), then run sync.`,
    [ELocalCloneState.DIVERGED]:
      "The site's history was rewritten since this clone was made. Run sync; if the rebase can't apply cleanly, run reset to match the site (local edits that weren't saved are lost).",
  }[state];

  return {
    remote_head: head,
    branch,
    local_state: state,
    next_step: next,
    ...(changed && {
      changed_files_since_local: changed.slice(0, MAX_LISTED_CHANGES),
      ...(changed.length > MAX_LISTED_CHANGES && {
        changed_files_total: changed.length,
      }),
    }),
    commands: {
      clone: `${git} clone --branch ${branch} ${url} ${dir}`,
      sync: `${git} fetch ${url} +refs/heads/${branch}:refs/remotes/origin/${branch} && git rebase --autostash origin/${branch}`,
      ...(state === ELocalCloneState.DIVERGED && {
        reset: `${git} fetch ${url} +refs/heads/${branch}:refs/remotes/origin/${branch} && git reset --hard origin/${branch}`,
      }),
      base_commit: "git rev-parse HEAD",
      remove_stored_token: "git config --unset-all http.extraheader",
    },
    token_expires_at: expires_at.toISOString(),
    rules: [
      "Run the commands exactly as given; they never prompt for a password. When they stop working (after an hour), call this tool again.",
      "Never write a token into .git/config or the remote URL. If one is there from before, run remove_stored_token.",
      "git push is refused. Save edits with write_files, base_commit = the clone's HEAD after the last sync.",
    ],
  };
};

type TWriteOptions = {
  message?: string;
  description?: string;
  dry_run?: boolean;
  branch?: string;
  open_pr?: boolean;
};

/** Sets or removes named frontmatter (or data-file) fields; the rest of the file is untouched. */
export const updateEntryFields = async (
  agent: TAgentContext,
  projectId: unknown,
  input: TWriteOptions &
    TFieldChanges & {
      path: unknown;
      message: string;
      expected_sha?: string;
      allow_new_fields?: boolean;
    },
) => {
  const project = await resolveWritableProject(agent, projectId);
  const path = normalizeRepoPath(input.path);
  const head = await requireHead(
    await createProjectGitClient(project, agent.user_id),
  );
  const reader = await createCachedProjectGitClient(project, agent.user_id);
  const file = await reader.readFile(head, path);
  if (!file) throw await missingFile(reader, head, path);
  if (input.set && Object.keys(input.set).length) {
    await checkAgainstSchema(reader, head, path, file.content, {
      set: input.set,
      allowNew: Boolean(input.allow_new_fields),
    });
  }
  const updated = updateFields(path, file.content.toString("utf-8"), {
    set: input.set,
    unset: input.unset,
  });
  const result = await commitChangeset(agent, project, {
    message: input.message,
    description: input.description,
    expected_shas: { [path]: input.expected_sha ?? file.sha },
    dry_run: input.dry_run,
    branch: input.branch,
    open_pr: input.open_pr,
    changes: [
      { op: "upsert", path, content: Buffer.from(updated.text, "utf-8") },
    ],
  });
  return {
    ...result,
    path,
    changed: [
      ...Object.keys(input.set ?? {}),
      ...(input.unset ?? []).map((k) => `-${k}`),
    ],
    ...(input.dry_run && { new_frontmatter: updated.data }),
  };
};

/** Schema of the file's folder (create_entry's lookup); invented field names are refused unless allowNew. */
const checkAgainstSchema = async (
  reader: TCachedGitClient,
  head: string,
  path: string,
  content: Buffer,
  { set, allowNew }: { set: Record<string, unknown>; allowNew: boolean },
) => {
  const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
  if (!dir) return;
  const siteConfig = await readSiteConfig(reader, head);
  const found = await findSchema(
    reader,
    head,
    cleanRoot(siteConfig?.content),
    { folder: dir },
    configPaths().schema,
  ).catch(() => undefined);
  const template = found?.schema.template;
  if (!found || !template?.length) return;
  const valid = template.map((f) => f.name);
  if (!allowNew) {
    const existing = Object.keys(
      readFields(path, content.toString("utf-8")) ?? {},
    );
    const unknown = Object.keys(set).filter((key) => {
      const top = String(parseFieldPath(key)[0]);
      return !valid.includes(top) && !existing.includes(top);
    });
    if (unknown.length) {
      throw agentError(
        `${unknown.map((k) => `"${k}"`).join(", ")} isn't a field of the ${found.name} schema`,
        400,
        EToolErrorCode.UNKNOWN_FIELD,
        {
          fix: "Use a name from valid_fields. Pass allow_new_fields: true only if the user asked for a new field.",
          details: { schema: found.name, valid_fields: valid },
        },
      );
    }
  }
  const problems = checkEntryFields(
    template,
    Object.fromEntries(
      Object.entries(set).filter(
        ([k]) => !k.includes(".") && valid.includes(k),
      ),
    ),
  );
  if (problems.length) {
    throw agentError(problems.join("; "), 400, EToolErrorCode.INVALID_FIELDS, {
      fix: "Fix the named fields (get_schema shows types and options) and retry.",
    });
  }
};

type TSchemaFile = {
  name?: string;
  file?: string;
  fileType?: string;
  fmType?: TDocFormat;
  template?: TTemplateField[];
};

const slugify = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

/** Same lookup as the editor (use-schema-data.ts): the folder's schema, else its nearest parent's. */
const findSchema = async (
  reader: TCachedGitClient,
  head: string,
  contentRoot: string | undefined,
  input: { schema?: string; folder?: string },
  schemaDir: string,
) => {
  const relative = (folder: string) =>
    contentRoot && under(folder, contentRoot)
      ? folder.slice(contentRoot.length).replace(/^\/+/, "")
      : folder;
  let candidates: string[];
  if (input.schema) {
    const prefix = `${schemaDir}/`;
    const name = (
      input.schema.startsWith(prefix)
        ? input.schema.slice(prefix.length)
        : input.schema
    ).replace(/\.json$/, "");
    candidates = [name];
  } else {
    candidates = [];
    let current = relative(input.folder!);
    while (current) {
      candidates.push(current);
      current = current.includes("/")
        ? current.slice(0, current.lastIndexOf("/"))
        : "";
    }
  }
  const paths = candidates.map((c) => `${schemaDir}/${c}.json`);
  const files = await reader.readFiles(head, paths);
  for (const [i, path] of paths.entries()) {
    const raw = files.get(path)?.content.toString("utf-8");
    if (!raw) continue;
    try {
      return { name: candidates[i], schema: JSON.parse(raw) as TSchemaFile };
    } catch {
      throw new ApiError(`${path} isn't valid JSON`, 400, "");
    }
  }
  if (input.schema) {
    const { entries } = await reader.readTree(head, schemaDir);
    throw unknownSchema(
      input.schema,
      entries
        .filter((e) => e.type === "blob" && e.path.endsWith(".json"))
        .map((e) => e.path.slice(schemaDir.length + 1, -".json".length)),
    );
  }
  return undefined;
};

/** A new content file from its folder's schema: defaults filled, fields checked, nothing overwritten. */
export const createEntry = async (
  agent: TAgentContext,
  projectId: unknown,
  input: TWriteOptions & {
    folder?: string;
    schema?: string;
    title?: string;
    slug?: string;
    fields?: Record<string, unknown>;
    body?: string;
  },
) => {
  const project = await resolveWritableProject(agent, projectId);
  if (!input.folder && !input.schema) {
    throw new ApiError("Pass folder or schema", 400, "");
  }
  const head = await requireHead(
    await createProjectGitClient(project, agent.user_id),
  );
  const reader = await createCachedProjectGitClient(project, agent.user_id);
  const siteConfig = await readSiteConfig(reader, head);
  const contentRoot = cleanRoot(siteConfig?.content);
  const folder = input.folder
    ? normalizeRepoPath(input.folder.replace(/\/+$/, ""))
    : undefined;
  const found = await findSchema(
    reader,
    head,
    contentRoot,
    { schema: input.schema, folder },
    configPaths().schema,
  );
  if (folder && !found) {
    const dirs = foldersOf(await blobPaths(reader, head));
    if (!dirs.includes(folder)) {
      const suggestions = closestPaths(
        folder,
        dirs.filter((d) => !contentRoot || under(d, contentRoot)),
      );
      throw agentError(
        `${folder} doesn't exist and has no schema`,
        404,
        EToolErrorCode.NOT_FOUND,
        {
          fix: "Use a folder from did_you_mean or get_project_context content.folders, or pass schema.",
          ...(suggestions.length && { details: { did_you_mean: suggestions } }),
        },
      );
    }
  }
  const targetFolder =
    folder ??
    normalizeRepoPath([contentRoot, found!.name].filter(Boolean).join("/"));
  const template = found?.schema.template ?? [];
  const fields = input.fields ?? {};

  const problems = found ? checkEntryFields(template, fields) : [];
  const data = {
    ...defaultsFromTemplate(template, input.title),
    ...(input.title !== undefined && !found && { title: input.title }),
    ...fields,
  };
  const missing = missingRequired(template, data);
  if (missing.length) {
    problems.push(`Required fields are empty: ${missing.join(", ")}`);
  }
  if (problems.length) {
    throw agentError(problems.join("; "), 400, EToolErrorCode.INVALID_FIELDS, {
      fix: "Fix the named fields (get_schema shows names, types and options) and retry.",
    });
  }

  const slug = input.slug
    ? slugify(input.slug)
    : slugify(String(data.title ?? ""));
  if (!slug)
    throw new ApiError("Pass a title or slug for the file name", 400, "");
  const ext = (found?.schema.fileType || "md").replace(/^\./, "");
  const path = `${targetFolder}/${slug}.${ext}`;
  const body = input.body?.trim()
    ? `\n${input.body.replace(/^\n+/, "").replace(/\n*$/, "\n")}`
    : "\n";
  const content = serializeEntry(found?.schema.fmType ?? "yaml", data, body);

  const result = await commitChangeset(agent, project, {
    message:
      input.message?.trim() ||
      `Add ${String(data.title || slug)}`.slice(0, 200),
    description: input.description,
    expected_shas: { [path]: null },
    dry_run: input.dry_run,
    branch: input.branch,
    open_pr: input.open_pr,
    changes: [{ op: "upsert", path, content: Buffer.from(content, "utf-8") }],
  });
  if (result.status === "conflict") {
    throw agentError(
      `${path} already exists. Pick another slug, or change it with update_fields.`,
      409,
      EToolErrorCode.EXISTS,
    );
  }
  return {
    ...result,
    path,
    schema: found ? `${configPaths().schema}/${found.name}.json` : null,
    ...(input.dry_run && { content }),
  };
};

export enum EEntrySort {
  DATE_DESC = "date_desc",
  DATE_ASC = "date_asc",
  TITLE_ASC = "title_asc",
  TITLE_DESC = "title_desc",
}

const ENTRY_FILE = /\.(mdx?|markdown|html?|json|ya?ml|toml)$/i;
const MAX_ENTRY_SCAN = 500;
const MAX_FIELD_CHARS = 300;
const DEFAULT_ENTRY_FIELDS = ["title", "date", "draft"];

const fieldPreview = (value: unknown) => {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "string") {
    return value.length > MAX_FIELD_CHARS
      ? `${value.slice(0, MAX_FIELD_CHARS)}…`
      : value;
  }
  if (value === null || typeof value !== "object") return value;
  const json = JSON.stringify(value);
  return json.length > MAX_FIELD_CHARS ? "(too long; use read_files)" : value;
};

const timeOf = (value: unknown) => {
  const time = Date.parse(
    value instanceof Date ? value.toISOString() : String(value ?? ""),
  );
  return Number.isNaN(time) ? undefined : time;
};

/** Posts and pages of one folder with chosen frontmatter fields, so agents don't read files one by one. */
export const listEntries = async (
  agent: TAgentContext,
  projectId: unknown,
  input: {
    folder?: string;
    schema?: string;
    fields?: string[];
    query?: string;
    sort?: EEntrySort;
    limit?: number;
    cursor?: string;
  },
) => {
  const project = await resolveProject(
    agent,
    projectId,
    EAgentScope.CONTENT_READ,
  );
  if (!input.folder && !input.schema) {
    throw agentError(
      "Pass folder or schema",
      400,
      EToolErrorCode.INVALID_INPUT,
      {
        fix: "Use a folder from get_project_context content.folders, or a schema name.",
      },
    );
  }
  const reader = await createCachedProjectGitClient(project, agent.user_id);
  const head = await requireHead(reader);
  const contentRoot = cleanRoot((await readSiteConfig(reader, head))?.content);
  let folder: string;
  if (input.folder) {
    folder = normalizeRepoPath(input.folder.replace(/\/+$/, ""));
  } else {
    const found = await findSchema(
      reader,
      head,
      contentRoot,
      { schema: input.schema },
      configPaths().schema,
    );
    folder = normalizeRepoPath(
      [contentRoot, found!.name].filter(Boolean).join("/"),
    );
  }
  const { entries, truncated } = await reader.readTree(head);
  const files = entries
    .filter(
      (e) =>
        e.type === "blob" && under(e.path, folder) && ENTRY_FILE.test(e.path),
    )
    .map((e) => e.path)
    .sort();
  if (!files.length) {
    const dirs = foldersOf(
      entries.filter((e) => e.type === "blob").map((e) => e.path),
    );
    if (!dirs.includes(folder)) {
      const suggestions = closestPaths(folder, dirs);
      throw agentError(
        `${folder} doesn't exist`,
        404,
        EToolErrorCode.NOT_FOUND,
        {
          fix: "Use a folder from did_you_mean or get_project_context content.folders.",
          ...(suggestions.length && { details: { did_you_mean: suggestions } }),
        },
      );
    }
  }
  const scanned = files.slice(0, MAX_ENTRY_SCAN);
  const read = await reader.readFiles(head, scanned);
  const wanted = input.fields?.length ? input.fields : DEFAULT_ENTRY_FIELDS;
  const needle = input.query?.trim().toLowerCase();
  const rows = scanned.flatMap((path) => {
    const file = read.get(path);
    if (!file) return [];
    const data =
      (file.content.length <= MAX_READ_BYTES &&
        readFields(path, file.content.toString("utf-8"))) ||
      {};
    if (
      needle &&
      !String(data.title ?? "")
        .toLowerCase()
        .includes(needle)
    ) {
      return [];
    }
    return [
      {
        path,
        sha: file.sha,
        fields: Object.fromEntries(
          wanted
            .filter((name) => data[name] !== undefined)
            .map((name) => [name, fieldPreview(data[name])]),
        ),
        title: String(data.title ?? ""),
        time: timeOf(data.date),
      },
    ];
  });
  const sort = input.sort ?? EEntrySort.DATE_DESC;
  rows.sort((a, b) => {
    if (sort === EEntrySort.TITLE_ASC || sort === EEntrySort.TITLE_DESC) {
      const order =
        a.title.localeCompare(b.title) || a.path.localeCompare(b.path);
      return sort === EEntrySort.TITLE_ASC ? order : -order;
    }
    // Undated entries go last either way.
    if (a.time === undefined || b.time === undefined) {
      return (a.time === undefined ? 1 : 0) - (b.time === undefined ? 1 : 0);
    }
    return sort === EEntrySort.DATE_ASC ? a.time - b.time : b.time - a.time;
  });
  const limit = Math.min(Math.max(Number(input.limit) || 20, 1), 100);
  const offset = Math.max(Number(input.cursor) || 0, 0);
  return {
    ref: head,
    folder,
    total: rows.length,
    entries: rows
      .slice(offset, offset + limit)
      .map(({ path, sha, fields }) => ({ path, sha, fields })),
    ...(offset + limit < rows.length && {
      next_cursor: String(offset + limit),
    }),
    ...((files.length > MAX_ENTRY_SCAN || truncated) && {
      scan_truncated: true,
      hint: `Only the first ${MAX_ENTRY_SCAN} files were read; pass a narrower folder.`,
    }),
  };
};

const MAX_CHANGE_FILES = 50;
const MAX_DIFF_LINES = 200;
const MAX_DIFF_CHARS = 20_000;

/** What one commit did, file by file, with capped diffs. */
export const getChange = async (
  agent: TAgentContext,
  projectId: unknown,
  input: { commit_sha: string },
) => {
  const project = await resolveProject(
    agent,
    projectId,
    EAgentScope.CONTENT_READ,
  );
  const raw = await createProjectGitClient(project, agent.user_id);
  const sha = input.commit_sha.trim();
  const commit = await raw.readCommit(sha).catch(() => null);
  if (!commit) {
    throw agentError(`Commit ${sha} not found`, 404, EToolErrorCode.NOT_FOUND, {
      fix: "Use a commit sha from list_history or from a write result.",
    });
  }
  const reader = await createCachedProjectGitClient(project, agent.user_id);
  const parent = commit.parents[0];
  let paths: string[];
  if (parent) {
    const changed = await raw.changedPaths(parent, commit.sha);
    paths = changed === "diverged" ? [] : [...changed].sort();
  } else {
    paths = (await blobPaths(reader, commit.sha)).sort();
  }
  const listed = paths.slice(0, MAX_CHANGE_FILES);
  const [before, after] = await Promise.all([
    parent
      ? reader.readFiles(parent, listed)
      : new Map<string, TGitFile | null>(),
    reader.readFiles(commit.sha, listed),
  ]);
  let budget = MAX_DIFF_CHARS;
  const files = listed.map((path) => {
    const old = before.get(path) ?? null;
    const now = after.get(path) ?? null;
    const change = !old ? "added" : !now ? "removed" : "modified";
    if ([old, now].some((f) => f?.content.subarray(0, 8000).includes(0))) {
      return { path, change, diff: null, note: "binary file" };
    }
    const full = unifiedDiff(
      old?.content.toString("utf-8") ?? "",
      now?.content.toString("utf-8") ?? "",
    );
    const lines = full.split("\n");
    let diff = lines.slice(0, MAX_DIFF_LINES).join("\n");
    if (diff.length > budget) diff = diff.slice(0, Math.max(budget, 0));
    budget -= diff.length;
    return {
      path,
      change,
      diff,
      ...(diff.length < full.length && { diff_truncated: true }),
    };
  });
  const messageLines = commit.message.split("\n");
  const trailer = (key: string) =>
    messageLines
      .find((l) => l.startsWith(`${key}: `))
      ?.slice(key.length + 2)
      .trim();
  const description = messageLines
    .slice(1)
    .filter((l) => !/^[A-Za-z-]+: /.test(l))
    .join("\n")
    .trim()
    .slice(0, 1000);
  const user = trailer(USER_TRAILER);
  const via = trailer(AGENT_TRAILER);
  return {
    commit: commit.sha,
    parent: parent ?? null,
    subject: subjectOf(commit.message),
    ...(description && { description }),
    ...((user || via) && { made_by: { user, via } }),
    ...(commit.author && { author: commit.author }),
    ...(commit.date && { date: commit.date }),
    total_files: paths.length,
    files,
    ...(paths.length > listed.length && {
      files_truncated: true,
      hint: `Only the first ${MAX_CHANGE_FILES} files are shown.`,
    }),
  };
};

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** Where a file under the public folder is served on the site, e.g. public/images/a.png → /images/a.png. */
const sitePathFor = (path: string, siteConfig: TSiteConfig | null) => {
  const publicRoot = cleanRoot(siteConfig?.public) ?? "public";
  return under(path, publicRoot) ? path.slice(publicRoot.length) : undefined;
};

/** A one-time upload link, so agents send files with curl instead of base64 through the model. */
export const prepareUpload = async (
  agent: TAgentContext,
  projectId: unknown,
  input: { path: unknown; overwrite?: boolean; message?: string },
) => {
  const project = await resolveWritableProject(agent, projectId);
  if (!config.base_url) {
    throw new ApiError("This server has no BASE_URL configured", 500, "");
  }
  const path = normalizeRepoPath(input.path);
  const reader = await createCachedProjectGitClient(project, agent.user_id);
  const head = await requireHead(reader);
  const siteConfig = await readSiteConfig(reader, head);
  const roots = rootsFromConfig(siteConfig);
  const needed = scopeForPath(path, roots);
  if (!agent.scopes.has(needed)) {
    throw new ApiError(
      `${path} needs the ${needed} permission ("${AGENT_SCOPE_LABELS[needed]}" in ${brand.name} → Settings → MCP Connection)${roots.media.length ? `. Media goes under ${roots.media.join(", ")}` : ""}.`,
      403,
      "",
    );
  }
  if (!input.overwrite && (await reader.readFile(head, path))) {
    throw agentError(
      `${path} already exists. Pick another name, or pass overwrite: true to replace it.`,
      409,
      EToolErrorCode.EXISTS,
    );
  }
  const { ticket, expires_at } = issueUploadTicket(agent, {
    projectId: project.project_id,
    path,
    overwrite: Boolean(input.overwrite),
    message: input.message?.trim() || undefined,
  });
  const url = `${config.base_url}/agent-upload/${ticket}`;
  const sitePath = sitePathFor(path, siteConfig);
  return {
    upload_url: url,
    method: "PUT",
    command: `curl -sS --fail-with-body -T "<local file>" "${url}"`,
    path,
    ...(sitePath && { site_path: sitePath }),
    max_bytes: MAX_UPLOAD_BYTES,
    expires_at: expires_at.toISOString(),
    note: "Replace <local file> with the file's path and run the command once; the server commits the file. Then reference it in content by site_path (or path).",
  };
};

/** Commits the bytes sent to an upload link; the link fixed the site, path and overwrite choice. */
export const commitUpload = async (
  agent: TAgentContext,
  claims: TUploadClaims,
  content: Buffer,
) => {
  const project = await resolveWritableProject(agent, claims.p);
  const name = claims.f.slice(claims.f.lastIndexOf("/") + 1);
  const result = await commitChangeset(agent, project, {
    message: claims.m ?? `Upload ${name}`,
    expected_shas: claims.o ? undefined : { [claims.f]: null },
    changes: [{ op: "upsert", path: claims.f, content }],
  });
  const reader = await createCachedProjectGitClient(project, agent.user_id);
  const siteConfig = await readSiteConfig(reader, await requireHead(reader));
  const sitePath = sitePathFor(claims.f, siteConfig);
  return {
    ...describeUploadResult(result),
    path: claims.f,
    bytes: content.length,
    ...(sitePath && { site_path: sitePath }),
  };
};

const describeUploadResult = (result: TAgentChangesetResult) =>
  result.status === "conflict"
    ? {
        status: result.status,
        error:
          "A file appeared at this path in the meantime; nothing was saved.",
      }
    : {
        status: result.status,
        branch: result.branch,
        ...("commitSha" in result && { commit: result.commitSha }),
        ...(result.pull_request && { pull_request: result.pull_request }),
      };
