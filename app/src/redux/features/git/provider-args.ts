import { normalizeGitProvider } from "@/lib/utils/provider-checker";
import { TConfig, TFiles, TTree } from "@/types";

/**
 * The provider-shaped half of the git abstraction: how each provider names
 * and scopes the same logical request. Deliberately free of RTK Query and
 * auth imports so it stays directly testable.
 */

export type GitProviderId = "github" | "gitlab";

export type RepoConfig = Pick<
  TConfig,
  "owner" | "repoName" | "branch" | "repositoryId"
>;

export type TreeQueryOptions = { recursive?: boolean };

export type ContentQueryOptions = { parser?: boolean };

export type CommitsQueryOptions = {
  path?: string;
  page?: number;
  perPage?: number;
};

export type QueryArgs = Record<string, unknown>;

/** Shape of a cached trees response, shared by both providers. */
export type TreeCache = { files: TTree[]; trees: TFiles[] };

/** Shape of a cached single-file content response, shared by both providers. */
export type ContentCache = {
  data?: unknown;
  content?: unknown;
  commitDate?: string;
  [key: string]: unknown;
};

export type DirectoryEntry = { path: string; [key: string]: unknown };

export type DirectoryMutator = (files: DirectoryEntry[]) => DirectoryEntry[];

export type GitProviderArgs = {
  id: GitProviderId;
  commitTag: "GitHubCommit" | "GitLabCommit";
  /** Key under which a content query carries the file path. */
  contentPathKey: "path" | "file_path";

  /** Identifier for the repository in this provider's URL scheme. */
  repoId(config: RepoConfig): string;

  contentArgs(
    config: RepoConfig,
    path: string,
    options?: ContentQueryOptions,
  ): QueryArgs;
  treesArgs(
    config: RepoConfig,
    path: string,
    options?: TreeQueryOptions,
  ): QueryArgs;
  siteConfigArgs(
    config: RepoConfig,
    path: string,
    framework?: string,
  ): QueryArgs;
  commitsArgs(config: RepoConfig, options?: CommitsQueryOptions): QueryArgs;
  /** Author date of a commit entry, which the two providers name differently. */
  commitDate(commit: unknown): string | undefined;
  /** Identifier used to address a single commit: `sha` on GitHub, `id` on GitLab. */
  commitRef(commit: unknown): string | undefined;
  commitAuthor(commit: unknown): string | undefined;
  /**
   * Repository identity as the provider currently reports it, used to correct
   * a stored path that went stale after a rename.
   */
  canonicalRepo(repo: unknown): { path?: string; id?: string };
  /** Omit `commitRef` for the branch head's status. */
  commitStatusArgs(config: RepoConfig, commitRef?: string): QueryArgs;
  imageArgs(config: RepoConfig, path: string): QueryArgs;
  branchesArgs(config: RepoConfig): QueryArgs;

  /**
   * Whether a cached trees entry created with `args` covers `filePath`.
   * Inserting into a listing that does not cover it would corrupt the cache.
   */
  treeScopeCovers(args: QueryArgs, filePath: string): boolean;

  /**
   * Applies `mutate` to a cached directory listing. GitHub stores it as a
   * bare array (replaced by the return value); GitLab nests it under `items`
   * (mutated in place, so the return value is ignored).
   */
  updateDirectoryListing(draft: unknown, mutate: DirectoryMutator): unknown;
};

/**
 * Cached trees hold raw git entries, not the UI's file shape. Converting on
 * insert keeps `type` populated, which `pathToDir` needs to keep media out of
 * the Code listing.
 */
export const toTreeEntry = (file: TFiles): TTree => ({
  path: file.path,
  sha: file.sha,
  type: file.isFile ? "blob" : "tree",
  size: file.size,
  commitDate: file.commitDate,
  createdDate: file.createdDate,
});

/**
 * GitHub returns a status object, GitLab a bare string. Both collapse to the
 * state name the deployment badge and polling hook care about.
 */
export const commitStatusState = (status: unknown): string | undefined => {
  if (typeof status === "string") return status;
  const state = (status as { state?: unknown } | undefined)?.state;
  return typeof state === "string" ? state : undefined;
};

export const parentDir = (filePath: string): string =>
  filePath.includes("/") ? filePath.slice(0, filePath.lastIndexOf("/")) : "";

const isUnder = (filePath: string, dir: string): boolean =>
  dir === "" || filePath === dir || filePath.startsWith(`${dir}/`);

export const githubArgs: GitProviderArgs = {
  id: "github",
  commitTag: "GitHubCommit",
  contentPathKey: "path",

  repoId: (config) => `${config.owner}/${config.repoName}`,

  contentArgs: (config, path, options) => ({
    owner: config.owner,
    repo: config.repoName,
    path,
    ref: config.branch,
    ...(options?.parser === undefined ? {} : { parser: options.parser }),
  }),
  treesArgs: (config, _path, options) => ({
    owner: config.owner,
    repo: config.repoName,
    // GitHub's trees endpoint is addressed by ref, not by directory.
    tree_sha: config.branch,
    recursive: options?.recursive ? "1" : undefined,
    config,
  }),
  siteConfigArgs: (config, path, framework) => ({
    owner: config.owner,
    repo: config.repoName,
    path,
    ref: config.branch,
    ...(framework === undefined ? {} : { framework }),
  }),
  commitsArgs: (config, options) => ({
    owner: config.owner,
    repo: config.repoName,
    // GitHub's commit list is scoped by `sha`, not `ref`.
    sha: config.branch,
    ...(options?.path === undefined ? {} : { path: options.path }),
    ...(options?.page === undefined ? {} : { page: options.page }),
    ...(options?.perPage === undefined ? {} : { per_page: options.perPage }),
  }),
  commitDate: (commit) =>
    (commit as { commit?: { author?: { date?: string } } } | undefined)?.commit
      ?.author?.date,
  commitRef: (commit) => (commit as { sha?: string } | undefined)?.sha,
  commitAuthor: (commit) =>
    (commit as { commit?: { author?: { name?: string } } } | undefined)?.commit
      ?.author?.name,
  // GitHub has no numeric-id write endpoints, so only the path is tracked.
  canonicalRepo: (repo) => ({
    path: (repo as { full_name?: string } | undefined)?.full_name,
  }),
  commitStatusArgs: (config, commitRef) => ({
    owner: config.owner,
    repo: config.repoName,
    ref: commitRef ?? config.branch,
  }),
  imageArgs: (config, path) => ({
    owner: config.owner,
    repo: config.repoName,
    path,
    ref: config.branch,
  }),
  branchesArgs: (config) => ({
    owner: config.owner,
    repo: config.repoName,
  }),

  // A recursive tree holds the whole repo; a shallow one only the root.
  treeScopeCovers: (args, filePath) =>
    args.recursive === "1" ? true : parentDir(filePath) === "",

  updateDirectoryListing: (draft, mutate) =>
    mutate(Array.isArray(draft) ? (draft as DirectoryEntry[]) : []),
};

export const gitlabArgs: GitProviderArgs = {
  id: "gitlab",
  commitTag: "GitLabCommit",
  contentPathKey: "file_path",

  // GitLab keeps a redirect for a renamed project on GET but rejects every
  // other method, so the numeric id is used whenever it is known.
  repoId: (config) =>
    config.repositoryId ||
    (config.repoName ? `${config.owner}/${config.repoName}` : config.owner),

  contentArgs: (config, path, options) => ({
    id: gitlabArgs.repoId(config),
    file_path: path,
    ref: config.branch,
    ...(options?.parser === undefined ? {} : { parser: options.parser }),
  }),
  treesArgs: (config, path, options) => ({
    id: gitlabArgs.repoId(config),
    path,
    ref: config.branch,
    recursive: options?.recursive ?? false,
    config,
  }),
  siteConfigArgs: (config, path, framework) => ({
    id: gitlabArgs.repoId(config),
    file_path: path,
    ref: config.branch,
    ...(framework === undefined ? {} : { framework }),
  }),
  commitsArgs: (config, options) => ({
    id: gitlabArgs.repoId(config),
    ref: config.branch,
    ...(options?.path === undefined ? {} : { path: options.path }),
    ...(options?.page === undefined ? {} : { page: options.page }),
    ...(options?.perPage === undefined ? {} : { per_page: options.perPage }),
  }),
  commitDate: (commit) =>
    (commit as { committed_date?: string } | undefined)?.committed_date,
  commitRef: (commit) => (commit as { id?: string } | undefined)?.id,
  commitAuthor: (commit) =>
    (commit as { author_name?: string } | undefined)?.author_name,
  canonicalRepo: (repo) => {
    const project = repo as
      { path_with_namespace?: string; id?: number | string } | undefined;
    return {
      path: project?.path_with_namespace,
      id: project?.id ? String(project.id) : undefined,
    };
  },
  commitStatusArgs: (config, commitRef) => ({
    id: gitlabArgs.repoId(config),
    ref: config.branch,
    ...(commitRef ? { sha: commitRef } : {}),
  }),
  imageArgs: (config, path) => ({
    id: gitlabArgs.repoId(config),
    file_path: path,
    ref: config.branch,
  }),
  branchesArgs: (config) => ({
    id: gitlabArgs.repoId(config),
  }),

  treeScopeCovers: (args, filePath) => {
    const scope = typeof args.path === "string" ? args.path : "";
    return args.recursive
      ? isUnder(filePath, scope)
      : parentDir(filePath) === scope;
  },

  updateDirectoryListing: (draft, mutate) => {
    const listing = draft as { items?: DirectoryEntry[] } | undefined;
    if (listing && Array.isArray(listing.items)) {
      listing.items = mutate(listing.items);
    }
    return listing;
  },
};

export const gitProviderArgs: Record<GitProviderId, GitProviderArgs> = {
  github: githubArgs,
  gitlab: gitlabArgs,
};

/** GitHub is the fallback for unknown/unset providers, matching prior behaviour. */
export const getGitProviderArgs = (
  provider: string | null | undefined,
): GitProviderArgs =>
  normalizeGitProvider(provider) === "gitlab" ? gitlabArgs : githubArgs;
