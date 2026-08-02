import { TConfig } from "@/types";
import { describe, expect, it } from "vitest";
import { gitProviderArgs } from "./provider-args";

const { github, gitlab } = gitProviderArgs;

const config = (overrides: Partial<TConfig> = {}) =>
  ({
    owner: "tfsomrat",
    repoName: "hugoplate",
    branch: "main",
    ...overrides,
  }) as TConfig;

/**
 * GitLab answers a GET on a renamed project's old path with a redirect but
 * rejects every other method, so writes have to address it by numeric id.
 */
describe("repoId", () => {
  it("falls back to the path when no id is stored", () => {
    expect(gitlab.repoId(config())).toBe("tfsomrat/hugoplate");
  });

  it("prefers the numeric id once known", () => {
    expect(gitlab.repoId(config({ repositoryId: "79516478" }))).toBe(
      "79516478",
    );
  });

  it("ignores an empty id rather than addressing an empty project", () => {
    expect(gitlab.repoId(config({ repositoryId: "" }))).toBe(
      "tfsomrat/hugoplate",
    );
  });

  it("still falls back to the owner alone when there is no repo name", () => {
    expect(gitlab.repoId(config({ repoName: "" }))).toBe("tfsomrat");
  });

  // GitHub has no numeric-id write endpoints — every mutation is addressed as
  // /repos/{owner}/{repo} — so the id must never leak into its identifier.
  it("never uses the id for GitHub", () => {
    expect(github.repoId(config({ repositoryId: "79516478" }))).toBe(
      "tfsomrat/hugoplate",
    );
  });

  it("threads the id through every GitLab argument builder", () => {
    const withId = config({ repositoryId: "79516478" });

    expect(gitlab.contentArgs(withId, "a.md").id).toBe("79516478");
    expect(gitlab.treesArgs(withId, "").id).toBe("79516478");
    expect(gitlab.commitsArgs(withId).id).toBe("79516478");
    expect(gitlab.commitStatusArgs(withId).id).toBe("79516478");
    expect(gitlab.imageArgs(withId, "a.png").id).toBe("79516478");
    expect(gitlab.siteConfigArgs(withId, "c.json").id).toBe("79516478");
    expect(gitlab.branchesArgs(withId).id).toBe("79516478");
  });
});
