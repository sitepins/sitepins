/**
 * GitHub and GitLab describe a repository with different field names. These
 * map both onto one view so callers stop branching per field.
 */

export type TRepoInfoView = {
  visibility: "public" | "private";
  homepage: string | undefined;
  defaultBranch: string | undefined;
  orgName: string | undefined;
};

export type TGitHubRepoLike = {
  private?: boolean;
  homepage?: string | null;
  default_branch?: string;
  owner?: { type?: string; login?: string } | null;
};

export type TGitLabRepoLike = {
  visibility?: string;
  web_url?: string;
  default_branch?: string;
  namespace?: { kind?: string; full_path?: string } | null;
};

export type TRepoInfoLike = TGitHubRepoLike | TGitLabRepoLike;

/**
 * Keyed off fields only GitLab sends. GitHub also returns `visibility`, so
 * testing that would classify every GitHub repo as GitLab.
 */
const isGitLabShape = (repo: TRepoInfoLike): repo is TGitLabRepoLike =>
  "web_url" in repo || "namespace" in repo;

export function toRepoInfoView(
  repo: TRepoInfoLike | undefined,
): TRepoInfoView | undefined {
  if (!repo) return undefined;

  if (isGitLabShape(repo)) {
    return {
      visibility: repo.visibility === "private" ? "private" : "public",
      homepage: repo.web_url || undefined,
      defaultBranch: repo.default_branch || undefined,
      orgName:
        repo.namespace?.kind === "group"
          ? repo.namespace.full_path || undefined
          : undefined,
    };
  }

  return {
    visibility: repo.private ? "private" : "public",
    homepage: repo.homepage || undefined,
    defaultBranch: repo.default_branch || undefined,
    orgName:
      repo.owner?.type === "Organization"
        ? repo.owner.login || undefined
        : undefined,
  };
}
