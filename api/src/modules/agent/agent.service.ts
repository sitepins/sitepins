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
import { requireScope } from "./agent.auth";
import { agentCache, forgetHead, TCachedGitClient } from "./agent.cache";
import {
  createCachedProjectGitClient,
  createProjectGitClient,
  getProjectToken,
  isGitLabProject,
} from "./agent.git";
import { globToRegExp } from "./agent.glob";
import { canWrite } from "./agent.tools";
import {
  AGENT_SCOPE_LABELS,
  EAgentScope,
  EAgentWriteMode,
  EContextPart,
  TAgentContext,
} from "./agent.type";

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
  { write = false }: { write?: boolean } = {},
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
    write,
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
    .filter((p) => under(p, SCHEMA_DIR) && p.endsWith(".json"))
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
      : `${SITE_CONFIG_PATH} is missing, so content and media folders are unknown. Writes need code:write until the project is opened in Sitepins once.`,
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
  const { entries } = await client.readTree(head, SCHEMA_DIR);
  const paths = entries
    .filter((e) => e.type === "blob" && e.path.endsWith(".json"))
    .map((e) => e.path);
  const byPath = paths.find(
    (p) => p === name || p === `${SCHEMA_DIR}/${name}.json`,
  );
  const candidates = byPath ? [byPath] : paths;
  const files = await client.readFiles(head, candidates);
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
  }
  throw new ApiError(`No schema named ${name}`, 404, "");
};

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
  if (!file) throw new ApiError(`${path} doesn't exist at ${ref}`, 404, "");
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
  let budget = MAX_BATCH_BYTES;
  return {
    ref,
    files: paths.map((path) => {
      const file = read.get(path);
      if (!file) return { path, error: "not found" };
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
      permission_hint: `Some matches can't be changed with this token. The user can turn on ${blocked.map((s) => `"${AGENT_SCOPE_LABELS[s]}"`).join(" and ")} for it in Sitepins → Settings → MCP Connection.`,
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
): Promise<TAgentChangesetResult> =>
  commitChangeset(agent, await resolveWritableProject(agent, projectId), input);

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
    throw new ApiError("This agent has read-only access", 403, "");
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
              reason: `needs the ${scopeForPath(v.path, roots)} permission ("${AGENT_SCOPE_LABELS[scopeForPath(v.path, roots)]}" in Sitepins → Settings → MCP Connection)`,
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
      throw Object.assign(
        new ApiError(
          `${path}: edit ${i + 1} old_string was not found. Re-read the file; it may have changed.`,
          409,
          "",
        ),
        { code: "no_match" },
      );
    }
    if (count > 1 && !edit.replace_all) {
      throw Object.assign(
        new ApiError(
          `${path}: edit ${i + 1} old_string matches ${count} times. Add surrounding text to make it unique, or set replace_all.`,
          409,
          "",
        ),
        { code: "ambiguous" },
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
  if (!file) throw new ApiError(`${path} doesn't exist`, 404, "");
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
  return { ...result, path, previous_sha: file.sha };
};

const MAX_UNDO_FILES = 100;

const subjectOf = (message: string) => message.split("\n")[0].trim();

/** Puts back the files a commit touched, as a new commit; refuses if they changed again since. */
export const undoChange = async (
  agent: TAgentContext,
  projectId: unknown,
  input: {
    commit_sha: string;
    message?: string;
    dry_run?: boolean;
    branch?: string;
    open_pr?: boolean;
  },
) => {
  const project = await resolveWritableProject(agent, projectId);
  const raw = await createProjectGitClient(project, agent.user_id);
  const head = await requireHead(raw);
  const commit = await raw.readCommit(input.commit_sha);
  if (!commit) {
    throw new ApiError(`Commit ${input.commit_sha} not found`, 404, "");
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
    description: `Reverts ${commit.sha}.`,
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
      hint: "Someone changed these files after that commit. Show the user what changed, then edit the current version instead.",
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
    [EDeployState.UNKNOWN]:
      "The hosting provider doesn't report builds to the repository, so Sitepins can't tell whether this change is live. It usually goes live once the host rebuilds; check the site or the host's dashboard.",
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
