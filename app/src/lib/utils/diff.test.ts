import { describe, expect, it } from "vitest";
import { computeUnifiedDiff } from "./diff";

describe("computeUnifiedDiff", () => {
  it("detects brand new files accurately", () => {
    const res = computeUnifiedDiff("", "Line 1\nLine 2", "test.md");
    expect(res.isNewFile).toBe(true);
    expect(res.addedLines).toBe(2);
    expect(res.deletedLines).toBe(0);
    expect(res.diff).toContain("+Line 1");
    expect(res.diff).toContain("+Line 2");
  });

  it("detects completely deleted files", () => {
    const res = computeUnifiedDiff("Line 1\nLine 2", "", "test.md");
    expect(res.isNewFile).toBe(false);
    expect(res.addedLines).toBe(0);
    expect(res.deletedLines).toBe(2);
    expect(res.diff).toContain("-Line 1");
    expect(res.diff).toContain("-Line 2");
  });

  it("detects section deletion from markdown body", () => {
    const oldDoc = `## Intro\nIntro text.\n\n## Deleted Section\nThis was removed.\n\n## Outro\nGoodbye.`;
    const newDoc = `## Intro\nIntro text.\n\n## Outro\nGoodbye.`;

    const res = computeUnifiedDiff(oldDoc, newDoc, "blog.md");
    expect(res.isNewFile).toBe(false);
    expect(res.addedLines).toBe(0);
    expect(res.deletedLines).toBeGreaterThan(0);
    expect(res.diff).toContain("-## Deleted Section");
    expect(res.diff).toContain("-This was removed.");
    expect(res.diff).toContain(" Intro text.");
    expect(res.diff).toContain(" ## Outro");
  });

  it("detects line additions and modifications", () => {
    const oldDoc = `Line 1\nLine 2\nLine 3`;
    const newDoc = `Line 1\nLine 2 modified\nLine 2.5 added\nLine 3`;

    const res = computeUnifiedDiff(oldDoc, newDoc, "test.md");
    expect(res.isNewFile).toBe(false);
    expect(res.addedLines).toBe(2);
    expect(res.deletedLines).toBe(1);
    expect(res.diff).toContain("-Line 2");
    expect(res.diff).toContain("+Line 2 modified");
    expect(res.diff).toContain("+Line 2.5 added");
  });

  it("returns empty diff when contents are identical", () => {
    const doc = `Line 1\nLine 2\nLine 3`;
    const res = computeUnifiedDiff(doc, doc, "test.md");
    expect(res.diff).toBe("");
    expect(res.addedLines).toBe(0);
    expect(res.deletedLines).toBe(0);
    expect(res.isNewFile).toBe(false);
  });
});
