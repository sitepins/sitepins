import { describe, expect, it } from "vitest";
import {
  findRequestForBranch,
  toPullRequestView,
  toPullRequestViews,
  type TGitHubPullLike,
  type TGitLabMergeRequestLike,
} from "./pull-request";

const ghPull: TGitHubPullLike = {
  number: 42,
  title: "Add docs",
  head: { ref: "feature/docs" },
  html_url: "https://github.com/o/r/pull/42",
};

const glMr: TGitLabMergeRequestLike = {
  iid: 7,
  title: "Add docs",
  source_branch: "feature/docs",
  web_url: "https://gitlab.com/o/r/-/merge_requests/7",
};

describe("toPullRequestView", () => {
  it("maps a GitHub pull request", () => {
    expect(toPullRequestView(ghPull)).toEqual({
      id: 42,
      title: "Add docs",
      sourceBranch: "feature/docs",
      url: "https://github.com/o/r/pull/42",
    });
  });

  it("maps a GitLab merge request", () => {
    expect(toPullRequestView(glMr)).toEqual({
      id: 7,
      title: "Add docs",
      sourceBranch: "feature/docs",
      url: "https://gitlab.com/o/r/-/merge_requests/7",
    });
  });

  it("uses iid, not id, so merge calls address the right request", () => {
    const withBothIds = { ...glMr, id: 9001 } as TGitLabMergeRequestLike;
    expect(toPullRequestView(withBothIds).id).toBe(7);
  });
});

describe("toPullRequestViews", () => {
  it("returns an empty list for undefined", () => {
    expect(toPullRequestViews(undefined)).toEqual([]);
  });

  it("maps a mixed list onto one shape", () => {
    expect(toPullRequestViews([ghPull, glMr]).map((r) => r.url)).toEqual([
      ghPull.html_url,
      glMr.web_url,
    ]);
  });
});

describe("findRequestForBranch", () => {
  it("finds a GitHub request by its head ref", () => {
    expect(findRequestForBranch([ghPull], "feature/docs")?.id).toBe(42);
  });

  it("finds a GitLab request by its source branch", () => {
    expect(findRequestForBranch([glMr], "feature/docs")?.id).toBe(7);
  });

  it("returns undefined when no request targets the branch", () => {
    expect(findRequestForBranch([ghPull], "other")).toBeUndefined();
  });

  it("returns undefined when the branch is unknown", () => {
    expect(findRequestForBranch([ghPull], undefined)).toBeUndefined();
  });
});
