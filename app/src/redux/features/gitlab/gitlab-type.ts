/**
 * GitLab API Types
 *
 * Type definitions for GitLab REST API responses and request parameters.
 * These types mirror the structure of GitLab API responses.
 */

// ============================================================================
// Common Types
// ============================================================================

export type TGitLabProvider = "Gitlab";

// ============================================================================
// User Types
// ============================================================================

export type TGitLabUser = {
  id: number;
  username: string;
  name: string;
  state: string;
  avatar_url: string;
  web_url: string;
  email?: string;
};

// ============================================================================
// Project Types
// ============================================================================

export type TGitLabNamespace = {
  id: number;
  name: string;
  path: string;
  kind: "user" | "group";
  full_path: string;
  avatar_url?: string;
  web_url: string;
};

export type TGitLabProject = {
  id: number;
  description: string | null;
  default_branch: string;
  visibility: "private" | "internal" | "public";
  ssh_url_to_repo: string;
  http_url_to_repo: string;
  web_url: string;
  readme_url: string | null;
  name: string;
  name_with_namespace: string;
  path: string;
  path_with_namespace: string;
  namespace: TGitLabNamespace;
  created_at: string;
  updated_at: string;
  last_activity_at: string;
  archived: boolean;
  avatar_url: string | null;
  forks_count: number;
  star_count: number;
  owner?: TGitLabUser;
};

// ============================================================================
// Branch Types
// ============================================================================

export type TGitLabCommitRef = {
  id: string;
  short_id: string;
  created_at: string;
  parent_ids: string[];
  title: string;
  message: string;
  author_name: string;
  author_email: string;
  authored_date: string;
  committer_name: string;
  committer_email: string;
  committed_date: string;
  trailers: Record<string, string>;
  extended_trailers: Record<string, string[]>;
  web_url: string;
};

export type TGitLabBranch = {
  name: string;
  merged: boolean;
  protected: boolean;
  default: boolean;
  developers_can_push: boolean;
  developers_can_merge: boolean;
  can_push: boolean;
  web_url: string;
  commit: TGitLabCommitRef;
};

// ============================================================================

export type TGitLabPipeline = {
  id: number;
  iid: number;
  project_id: number;
  sha: string;
  ref: string;
  status:
    | "created"
    | "waiting_for_resource"
    | "preparing"
    | "pending"
    | "running"
    | "success"
    | "failed"
    | "canceled"
    | "skipped"
    | "manual"
    | "scheduled";
  source: string;
  created_at: string;
  updated_at: string;
  web_url: string;
};

// ============================================================================

// Tree / File Types
// ============================================================================

export type TGitLabTreeItem = {
  id: string;
  name: string;
  type: "tree" | "blob";
  path: string;
  mode: string;
  size?: number;
};

export type TGitLabFile = {
  file_name: string;
  file_path: string;
  size: number;
  encoding: "base64" | "text";
  content: string;
  content_sha256: string;
  ref: string;
  blob_id: string;
  commit_id: string;
  last_commit_id: string;
  execute_filemode: boolean;
};

export type TGitLabFileRaw = string;

// ============================================================================
// Commit Types
// ============================================================================

export type TGitLabCommit = {
  id: string;
  short_id: string;
  title: string;
  author_name: string;
  author_email: string;
  authored_date: string;
  committer_name: string;
  committer_email: string;
  committed_date: string;
  created_at: string;
  message: string;
  parent_ids: string[];
  web_url: string;
  trailers: Record<string, string>;
  extended_trailers: Record<string, string[]>;
  stats?: {
    additions: number;
    deletions: number;
    total: number;
  };
};

export type TGitLabCommitAction = {
  action: "create" | "delete" | "move" | "update" | "chmod";
  file_path: string;
  previous_path?: string;
  content?: string;
  encoding?: "text" | "base64";
  last_commit_id?: string;
  execute_filemode?: boolean;
};

export type TGitLabCreateCommitPayload = {
  branch: string;
  commit_message: string;
  actions: TGitLabCommitAction[];
  start_branch?: string;
  start_sha?: string;
  start_project?: string | number;
  author_email?: string;
  author_name?: string;
  stats?: boolean;
  force?: boolean;
};

export type TGitLabCreateCommitResponse = TGitLabCommit;

// ============================================================================
// Request Parameter Types
// ============================================================================

export type TGitLabProjectParams = {
  /** URL-encoded project path (e.g., "namespace/project") or project ID */
  id: string | number;
};

export type TGitLabTreeParams = TGitLabProjectParams & {
  path?: string;
  ref?: string;
  recursive?: boolean;
  per_page?: number;
  page?: number;
};

export type TGitLabFileParams = TGitLabProjectParams & {
  /** URL-encoded file path */
  file_path: string;
  ref?: string;
};

export type TGitLabBranchParams = TGitLabProjectParams & {
  search?: string;
  per_page?: number;
  page?: number;
  token?: string;
};

export type TGitLabCommitListParams = TGitLabProjectParams & {
  ref_name?: string;
  path?: string;
  since?: string;
  until?: string;
  all?: boolean;
  with_stats?: boolean;
  first_parent?: boolean;
  order?: "default" | "topo";
  per_page?: number;
  page?: number;
};

export type TGitLabCreateCommitParams = TGitLabProjectParams &
  TGitLabCreateCommitPayload;

// ============================================================================
// Generic API Types
// ============================================================================

export type TGitLabApiError = {
  message: string;
  error?: string;
  error_description?: string;
};

export type TGitLabPaginatedResponse<T> = {
  data: T[];
  headers: {
    "x-page"?: string;
    "x-per-page"?: string;
    "x-total"?: string;
    "x-total-pages"?: string;
    "x-next-page"?: string;
    "x-prev-page"?: string;
  };
};

// ============================================================================
// File Operation Types (for commits)
// ============================================================================

export type TGitLabFileOperation = {
  path: string;
  content?: string;
  delete?: boolean;
  previousPath?: string;
};
