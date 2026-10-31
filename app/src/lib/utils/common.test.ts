import { describe, expect, it } from "vitest";
import { mergePatterns } from "./common";

describe("mergePatterns", () => {
  it("handles string comma-separated patterns", () => {
    const result = mergePatterns({
      include: "blog/*.md, docs/*.md",
      exclude: "draft/*, !private/*",
    });

    expect(result.includes).toEqual(["blog/*.md", "docs/*.md"]);
    expect(result.excludes).toEqual(["draft/*", "private/*"]);
    expect(result.patterns).toEqual([
      "blog/*.md",
      "docs/*.md",
      "draft/*",
      "private/*",
    ]);
  });

  it("handles array inputs for include and exclude", () => {
    const result = mergePatterns({
      include: ["blog/*.md", "docs/*.md"],
      exclude: ["draft/*", "!private/*"],
    });

    expect(result.includes).toEqual(["blog/*.md", "docs/*.md"]);
    expect(result.excludes).toEqual(["draft/*", "private/*"]);
    expect(result.patterns).toEqual([
      "blog/*.md",
      "docs/*.md",
      "draft/*",
      "private/*",
    ]);
  });

  it("safely handles empty arrays without throwing", () => {
    const result = mergePatterns({
      include: undefined,
      exclude: [],
    });

    expect(result.includes).toEqual(["*"]);
    expect(result.excludes).toEqual([]);
    expect(result.patterns).toEqual([]);
  });

  it("safely handles undefined and empty values", () => {
    const result = mergePatterns({});

    expect(result.includes).toEqual(["*"]);
    expect(result.excludes).toEqual([]);
    expect(result.patterns).toEqual([]);
  });
});
