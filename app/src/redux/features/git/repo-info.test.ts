import { describe, expect, it } from "vitest";
import { toRepoInfoView } from "./repo-info";

describe("toRepoInfoView", () => {
  it("maps a private GitHub repo", () => {
    expect(
      toRepoInfoView({ private: true, homepage: "https://example.com" }),
    ).toEqual({
      visibility: "private",
      homepage: "https://example.com",
      defaultBranch: undefined,
      orgName: undefined,
    });
  });

  it("maps a public GitHub repo", () => {
    expect(toRepoInfoView({ private: false, homepage: null })).toEqual({
      visibility: "public",
      homepage: undefined,
      defaultBranch: undefined,
      orgName: undefined,
    });
  });

  it("maps a private GitLab project", () => {
    expect(
      toRepoInfoView({
        visibility: "private",
        web_url: "https://gitlab.com/o/r",
      }),
    ).toEqual({
      visibility: "private",
      homepage: "https://gitlab.com/o/r",
      defaultBranch: undefined,
      orgName: undefined,
    });
  });

  it("treats GitLab 'internal' as public, since it is not private", () => {
    expect(toRepoInfoView({ visibility: "internal" })?.visibility).toBe(
      "public",
    );
  });

  it("returns undefined when there is no repo yet", () => {
    expect(toRepoInfoView(undefined)).toBeUndefined();
  });

  it("never returns a visibility outside the project's own union", () => {
    for (const repo of [
      { visibility: "public" },
      { visibility: "private" },
      { private: true },
      { private: false },
    ]) {
      expect(["public", "private"]).toContain(toRepoInfoView(repo)?.visibility);
    }
  });

  it("keeps a GitHub homepage even though GitHub also sends `visibility`", () => {
    // The real payload carries both keys; only GitLab-only keys may route it.
    const githubRepo = {
      visibility: "public",
      private: false,
      homepage: "https://example.com",
    };
    expect(toRepoInfoView(githubRepo)?.homepage).toBe("https://example.com");
  });

  it("reads the default branch from either provider", () => {
    expect(toRepoInfoView({ default_branch: "trunk" })?.defaultBranch).toBe(
      "trunk",
    );
    expect(
      toRepoInfoView({
        web_url: "https://gitlab.com/o/r",
        default_branch: "dev",
      })?.defaultBranch,
    ).toBe("dev");
  });

  it("leaves the default branch undefined so callers pick their own fallback", () => {
    expect(toRepoInfoView({ private: false })?.defaultBranch).toBeUndefined();
    expect(
      toRepoInfoView({ default_branch: "" })?.defaultBranch,
    ).toBeUndefined();
  });

  it("names the owning GitHub organisation, but not a personal owner", () => {
    expect(
      toRepoInfoView({ owner: { type: "Organization", login: "acme" } })
        ?.orgName,
    ).toBe("acme");
    expect(
      toRepoInfoView({ owner: { type: "User", login: "somrat" } })?.orgName,
    ).toBeUndefined();
  });

  it("names the owning GitLab group, but not a personal namespace", () => {
    expect(
      toRepoInfoView({
        web_url: "https://gitlab.com/acme/r",
        namespace: { kind: "group", full_path: "acme/team" },
      })?.orgName,
    ).toBe("acme/team");
    expect(
      toRepoInfoView({
        web_url: "https://gitlab.com/somrat/r",
        namespace: { kind: "user", full_path: "somrat" },
      })?.orgName,
    ).toBeUndefined();
  });
});
