import { describe, expect, it } from "vitest";
import { treeItemsOf } from "./tree-items";

// The three shapes a trees query can be observed in: transformed (`files`),
// raw GitHub (`tree`), and GitLab's repo-tree endpoint (the array itself).

describe("treeItemsOf", () => {
  it("reads a transformed result", () => {
    expect(treeItemsOf({ files: [{ path: "a.md" }] })).toEqual([
      { path: "a.md" },
    ]);
  });

  it("reads a raw GitHub payload", () => {
    expect(treeItemsOf({ tree: [{ path: "a.md" }] })).toEqual([
      { path: "a.md" },
    ]);
  });

  it("reads GitLab's bare array", () => {
    expect(treeItemsOf([{ path: "a.md" }])).toEqual([{ path: "a.md" }]);
  });

  it("prefers files over tree when both are present", () => {
    expect(
      treeItemsOf({ files: [{ path: "from-files" }], tree: [{ path: "raw" }] }),
    ).toEqual([{ path: "from-files" }]);
  });

  it("returns an empty list for undefined", () => {
    expect(treeItemsOf(undefined)).toEqual([]);
  });

  it("returns an empty list when neither key holds an array", () => {
    expect(treeItemsOf({ files: null, tree: "nope" })).toEqual([]);
  });
});
