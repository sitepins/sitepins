/**
 * GitHub and GitLab describe a repository with different field names. These
 * map both onto one view so callers stop branching per field.
 */

export type TRepoInfoView = {
  /** GitHub reports a boolean `private`; GitLab a `visibility` string. */
  visibility: "public" | "private";
  /** The site the repo points at: GitHub `homepage`, GitLab `web_url`. */
  homepage: string | undefined;
};

export type TGitHubRepoLike = {
  private?: boolean;
  homepage?: string | null;
};

export type TGitLabRepoLike = {
  visibility?: string;
  web_url?: string;
};

export type TRepoInfoLike = TGitHubRepoLike | TGitLabRepoLike;

const isGitLabShape = (repo: TRepoInfoLike): repo is TGitLabRepoLike =>
  "visibility" in repo || "web_url" in repo;

export function toRepoInfoView(
  repo: TRepoInfoLike | undefined,
): TRepoInfoView | undefined {
  if (!repo) return undefined;

  if (isGitLabShape(repo)) {
    return {
      visibility: repo.visibility === "private" ? "private" : "public",
      homepage: repo.web_url || undefined,
    };
  }

  return {
    visibility: repo.private ? "private" : "public",
    homepage: repo.homepage || undefined,
  };
}
