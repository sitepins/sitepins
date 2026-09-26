import { describe, expect, it } from "vitest";
import {
  buildFileIndexBlock,
  buildSearchAssistPrompt,
  formatFileIndexLine,
  MAX_AI_FILE_MATCHES,
  sanitizeSearchAssistResult,
} from "./search-assist";

describe("formatFileIndexLine", () => {
  it("omits empty trailing metadata", () => {
    expect(formatFileIndexLine({ id: 3, path: "a.md" })).toBe("3|a.md");
  });

  it("includes dates as days and size", () => {
    expect(
      formatFileIndexLine({
        id: 1,
        path: "src/content/blog/x.md",
        collection: "Blog",
        updated: "2026-03-04T10:00:00Z",
        size: 120,
      }),
    ).toBe("1|src/content/blog/x.md|Blog|2026-03-04||120");
  });
});

describe("buildFileIndexBlock", () => {
  it("truncates to the character budget and reports omissions", () => {
    const files = Array.from({ length: 10 }, (_, id) => ({
      id,
      path: `file-${id}.md`,
    }));
    const { block, omitted } = buildFileIndexBlock(files, 36);
    expect(block.split("\n")).toHaveLength(3);
    expect(omitted).toBe(7);
  });
});

describe("buildSearchAssistPrompt", () => {
  it("lists the question and the file index", () => {
    const { prompt } = buildSearchAssistPrompt({
      query: "pricing post",
      files: [{ id: 0, path: "src/content/blog/pricing.md" }],
      today: "2026-09-26",
      maxIndexChars: 1000,
    });
    expect(prompt).toContain("QUESTION: pricing post");
    expect(prompt).toContain("0|src/content/blog/pricing.md");
  });
});

describe("sanitizeSearchAssistResult", () => {
  const known = { fileIds: new Set([0, 1, 2]) };

  it("drops invented ids, dedupes, and accepts numeric strings", () => {
    expect(
      sanitizeSearchAssistResult({ fileIds: [2, "1", 99, 2, "x"] }, known),
    ).toEqual({ fileIds: [2, 1] });
  });

  it("caps file matches", () => {
    const many = Array.from({ length: 20 }, (_, i) => i);
    const result = sanitizeSearchAssistResult(
      { fileIds: many },
      { fileIds: new Set(many) },
    );
    expect(result.fileIds).toHaveLength(MAX_AI_FILE_MATCHES);
  });

  it("tolerates garbage", () => {
    expect(sanitizeSearchAssistResult("nope", known)).toEqual({ fileIds: [] });
  });
});
