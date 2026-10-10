export type TGitHostName = "Github" | "Gitlab";

export type TCommitIdentity = { name: string; email: string };

export type TGitFile = { path: string; sha: string; content: Buffer };

export type TTreeEntry = { path: string; type: "blob" | "tree"; sha: string };

export type TFileChange =
  | { op: "upsert"; path: string; content: Buffer }
  | { op: "delete"; path: string };

export type TCommitSummary = {
  sha: string;
  message: string;
  author: string;
  date: string;
};

export type TPullRequest = { number: number; url: string };

export type TCommitRequest = {
  parent: string;
  changes: TFileChange[];
  message: string;
  author?: TCommitIdentity;
};

export type TGitClient = {
  host: TGitHostName;
  branch: string;
  /** Head commit sha of the branch, or null when the branch doesn't exist. */
  readHead(): Promise<string | null>;
  readFile(ref: string, path: string): Promise<TGitFile | null>;
  /** Blob sha per path at `ref`; null when the path isn't a file there. */
  statFiles(ref: string, paths: string[]): Promise<Map<string, string | null>>;
  readTree(
    ref: string,
    dir?: string,
  ): Promise<{ entries: TTreeEntry[]; truncated: boolean }>;
  /** Paths touched between `base` and `head`, or "diverged" when base isn't an ancestor of head. */
  changedPaths(base: string, head: string): Promise<Set<string> | "diverged">;
  /** Commits on top of `parent`; throws `ref_moved` when the branch is no longer at `parent`. */
  commit(request: TCommitRequest): Promise<string>;
  listCommits(options: {
    path?: string;
    limit: number;
  }): Promise<TCommitSummary[]>;
  /** Creates `name` at `sha`; false when it already exists. */
  createBranch(name: string, sha: string): Promise<boolean>;
  /** Opens (or returns the open) pull request from `head` into this client's branch. */
  openPullRequest(input: {
    head: string;
    title: string;
    body: string;
  }): Promise<TPullRequest>;
};

export type TGitClientOptions = {
  repository: string;
  branch: string;
  token: string;
  apiBase?: string;
  fetchImpl?: typeof fetch;
};
