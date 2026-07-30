/**
 * GitHub pull requests and GitLab merge requests carry the same information
 * under different names. Components branched on the provider at every field
 * read; these map both shapes onto one view instead.
 */

export type TPullRequestView = {
  /** `number` on GitHub, `iid` on GitLab — the id used in merge calls. */
  id: number;
  title: string;
  /** The branch the request merges from. */
  sourceBranch: string;
  url: string;
};

export type TGitHubPullLike = {
  number: number;
  title: string;
  head: { ref: string };
  html_url: string;
};

export type TGitLabMergeRequestLike = {
  iid: number;
  title: string;
  source_branch: string;
  web_url: string;
};

export type TPullRequestLike = TGitHubPullLike | TGitLabMergeRequestLike;

const isGitLabShape = (
  req: TPullRequestLike,
): req is TGitLabMergeRequestLike => "web_url" in req;

export function toPullRequestView(req: TPullRequestLike): TPullRequestView {
  if (isGitLabShape(req)) {
    return {
      id: req.iid,
      title: req.title,
      sourceBranch: req.source_branch,
      url: req.web_url,
    };
  }

  return {
    id: req.number,
    title: req.title,
    sourceBranch: req.head.ref,
    url: req.html_url,
  };
}

export function toPullRequestViews(
  reqs: readonly TPullRequestLike[] | undefined,
): TPullRequestView[] {
  return (reqs ?? []).map(toPullRequestView);
}

/** The open request whose source branch is `branch`, if there is one. */
export function findRequestForBranch(
  reqs: readonly TPullRequestLike[] | undefined,
  branch: string | undefined,
): TPullRequestView | undefined {
  if (!branch) return undefined;
  return toPullRequestViews(reqs).find((r) => r.sourceBranch === branch);
}
