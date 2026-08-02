import { describe, expect, it } from "vitest";
import { toRepoInfoView } from "./repo-info";

describe("toRepoInfoView", () => {
  it("maps a private GitHub repo", () => {
    expect(
      toRepoInfoView({ private: true, homepage: "https://example.com" }),
    ).toEqual({ visibility: "private", homepage: "https://example.com" });
  });

  it("maps a public GitHub repo", () => {
    expect(toRepoInfoView({ private: false, homepage: null })).toEqual({
      visibility: "public",
      homepage: undefined,
    });
  });

  it("maps a private GitLab project", () => {
    expect(
      toRepoInfoView({
        visibility: "private",
        web_url: "https://gitlab.com/o/r",
      }),
    ).toEqual({ visibility: "private", homepage: "https://gitlab.com/o/r" });
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
});
