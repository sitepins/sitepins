import { describe, expect, it } from "vitest";
import detectFramework from "./framework-detector";
import { treeItemsOf } from "./tree-items";

/**
 * GitLab's repo-tree endpoint returns the array itself, while GitHub's trees
 * query resolves to `{ files }`. Components that read `.files` off the GitLab
 * shape silently saw nothing, which disabled framework detection on GitLab
 * entirely. These pin the normalization both providers now go through.
 */

// GET /projects/:id/repository/tree?recursive=true
const gitlabTree = [
  { id: "a1", name: "next.config.js", type: "blob", path: "next.config.js" },
  { id: "a2", name: "package.json", type: "blob", path: "package.json" },
  { id: "a3", name: "content", type: "tree", path: "content" },
];

// GET /repos/:owner/:repo/git/trees/:sha, after transformResponse
const githubTree = {
  files: [
    { path: "next.config.js", type: "blob", sha: "a1" },
    { path: "package.json", type: "blob", sha: "a2" },
  ],
  trees: [],
};

describe("tree normalization across providers", () => {
  it("detects the framework from GitLab's bare array", () => {
    expect(detectFramework(treeItemsOf(gitlabTree))).toBe("nextjs");
  });

  it("detects the same framework from GitHub's transformed result", () => {
    expect(detectFramework(treeItemsOf(githubTree))).toBe("nextjs");
  });

  it("finds package.json in the GitLab shape", () => {
    const files = treeItemsOf(gitlabTree);
    expect(files.some((f) => f.path === "package.json")).toBe(true);
  });

  it("reading .files directly off the GitLab payload finds nothing", () => {
    // The bug this replaced: `treeData?.files` is undefined on GitLab, so
    // every guard of the form `!treeData?.files?.length` returned early.
    const asRecord = gitlabTree as unknown as { files?: unknown[] };
    expect(asRecord.files).toBeUndefined();
    expect(treeItemsOf(gitlabTree)).toHaveLength(3);
  });

  it("yields an empty list, not a crash, for an unfetched query", () => {
    expect(detectFramework(treeItemsOf(undefined))).toBeNull();
  });
});
