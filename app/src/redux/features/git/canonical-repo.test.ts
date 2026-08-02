import { describe, expect, it } from "vitest";
import { gitProviderArgs } from "./provider-args";

const { github, gitlab } = gitProviderArgs;

/**
 * Both providers redirect a GET on a renamed repository's old path, so this
 * lookup is where a stale stored path becomes visible.
 */
describe("canonicalRepo", () => {
  it("reads GitHub's current path from full_name", () => {
    expect(github.canonicalRepo({ full_name: "acme/site-renamed" })).toEqual({
      path: "acme/site-renamed",
    });
  });

  // GitHub exposes no id-addressable write endpoints, so tracking one would
  // give a false sense that renames are handled.
  it("never reports an id for GitHub", () => {
    expect(
      github.canonicalRepo({ full_name: "acme/site", id: 42 }).id,
    ).toBeUndefined();
  });

  it("reads GitLab's current path and numeric id", () => {
    expect(
      gitlab.canonicalRepo({
        path_with_namespace: "tfsomrat/hugoplate-gitlab",
        id: 79516478,
      }),
    ).toEqual({ path: "tfsomrat/hugoplate-gitlab", id: "79516478" });
  });

  it("stringifies the GitLab id so it round-trips through storage", () => {
    expect(gitlab.canonicalRepo({ id: 79516478 }).id).toBe("79516478");
  });

  it("reports nothing for an absent or empty response", () => {
    expect(github.canonicalRepo(undefined)).toEqual({ path: undefined });
    expect(gitlab.canonicalRepo(undefined)).toEqual({
      path: undefined,
      id: undefined,
    });
    expect(gitlab.canonicalRepo({})).toEqual({
      path: undefined,
      id: undefined,
    });
  });

  it("treats a zero id as absent rather than addressing project 0", () => {
    expect(gitlab.canonicalRepo({ id: 0 }).id).toBeUndefined();
  });
});
