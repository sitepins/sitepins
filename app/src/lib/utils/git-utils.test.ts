import { describe, expect, it, vi } from "vitest";
import {
  chunk,
  createGitCommitMessage,
  dedupeFiles,
  filterUploadableFiles,
  getGitAuthDetails,
  isTransientNetworkError,
  matchPattern,
  normalizeDeleteCommitMessage,
  normalizeSnippetPayload,
  parseSnippetFile,
  retry,
  runWithConcurrency,
  toBase64,
} from "./git-utils";

// These are the primitives every commit goes through, for both providers.

describe("filterUploadableFiles", () => {
  it("drops OS junk files", () => {
    const kept = filterUploadableFiles([
      { path: "content/post.md" },
      { path: "content/.DS_Store" },
      { path: "assets/Thumbs.db" },
    ]);

    expect(kept.map((f) => f.path)).toEqual(["content/post.md"]);
  });

  it("drops workflow files GitHub refuses to accept over the API", () => {
    const kept = filterUploadableFiles([
      { path: ".github/workflows/ci.yml" },
      { path: ".github/ISSUE_TEMPLATE/bug.md" },
    ]);

    expect(kept.map((f) => f.path)).toEqual([".github/ISSUE_TEMPLATE/bug.md"]);
  });

  it("keeps deletions even for otherwise filtered paths", () => {
    const kept = filterUploadableFiles([
      { path: ".github/workflows/ci.yml", delete: true },
      { path: "content/.DS_Store", delete: true },
    ]);

    expect(kept).toHaveLength(2);
  });
});

describe("dedupeFiles", () => {
  it("keeps the last entry for a repeated path, at its first position", () => {
    // A delete followed by a write of the same path must resolve to the write,
    // otherwise the file would be removed from the commit tree.
    const files = [
      { path: "a.md", delete: true },
      { path: "b.md" },
      { path: "a.md" },
    ];

    expect(dedupeFiles(files)).toEqual([{ path: "a.md" }, { path: "b.md" }]);
  });

  it("preserves first-seen ordering", () => {
    const files = [{ path: "b.md" }, { path: "a.md" }, { path: "b.md" }];
    expect(dedupeFiles(files).map((f) => f.path)).toEqual(["b.md", "a.md"]);
  });
});

describe("matchPattern", () => {
  it("treats an empty pattern as matching everything", () => {
    expect(matchPattern("anything", "")).toBe(true);
  });

  it("expands * and ? as glob wildcards", () => {
    expect(matchPattern("post.md", "*.md")).toBe(true);
    expect(matchPattern("post.mdx", "*.md")).toBe(false);
    expect(matchPattern("a.md", "?.md")).toBe(true);
    expect(matchPattern("ab.md", "?.md")).toBe(false);
  });

  it("escapes regex metacharacters so a dot is literal", () => {
    expect(matchPattern("aXmd", "a.md")).toBe(false);
    expect(matchPattern("a.md", "a.md")).toBe(true);
  });

  it("anchors the match at both ends", () => {
    expect(matchPattern("prefix-post.md", "post.md")).toBe(false);
  });
});

describe("chunk", () => {
  it("splits into batches of the requested size", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("returns an empty list for empty input", () => {
    expect(chunk([], 3)).toEqual([]);
  });
});

describe("runWithConcurrency", () => {
  it("returns results in input order regardless of completion order", async () => {
    const delays = [30, 0, 15];
    const results = await runWithConcurrency(delays, 3, async (ms, index) => {
      await new Promise((r) => setTimeout(r, ms));
      return index;
    });

    expect(results).toEqual([0, 1, 2]);
  });

  it("never exceeds the concurrency cap", async () => {
    let inFlight = 0;
    let peak = 0;

    await runWithConcurrency([1, 2, 3, 4, 5, 6], 2, async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
    });

    expect(peak).toBeLessThanOrEqual(2);
  });

  it("handles an empty work list", async () => {
    expect(await runWithConcurrency([], 4, async () => 1)).toEqual([]);
  });
});

describe("retry", () => {
  it("returns the first successful result without retrying", async () => {
    const fn = vi.fn(async () => "ok");
    expect(await retry(fn)).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries transient failures up to the limit", async () => {
    let calls = 0;
    const fn = vi.fn(async () => {
      calls += 1;
      if (calls < 3) throw { status: 503 };
      return "recovered";
    });

    expect(await retry(fn, { retries: 2, baseDelayMs: 1 })).toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("gives up immediately on a non-retriable error", async () => {
    const fn = vi.fn(async () => {
      throw { status: 404 };
    });

    await expect(retry(fn, { retries: 3, baseDelayMs: 1 })).rejects.toEqual({
      status: 404,
    });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("rethrows the last error once retries are exhausted", async () => {
    const fn = vi.fn(async () => {
      throw new Error("network unreachable");
    });

    await expect(
      retry(fn, { retries: 1, baseDelayMs: 1 }),
    ).rejects.toThrowError("network unreachable");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe("createGitCommitMessage", () => {
  it("returns the bare message when nothing else is supplied", () => {
    expect(createGitCommitMessage("Update post", undefined)).toBe(
      "Update post",
    );
  });

  it("separates description and trailer with blank lines", () => {
    expect(
      createGitCommitMessage("Update", "Longer body", "Ada Lovelace"),
    ).toBe(
      "Update\n\nLonger body\n\nCo-authored-by: Ada Lovelace <adalovelace@users.noreply.github.com>",
    );
  });

  it("prefers an explicit author email", () => {
    expect(
      createGitCommitMessage("Update", undefined, "Ada", "ada@example.com"),
    ).toContain("Co-authored-by: Ada <ada@example.com>");
  });

  it("derives the noreply domain from the provider", () => {
    expect(
      createGitCommitMessage("Update", undefined, "Ada", undefined, "Gitlab"),
    ).toContain("@users.noreply.gitlab.com");
  });
});

describe("normalizeDeleteCommitMessage", () => {
  it("leaves the message alone when not every file is a deletion", () => {
    expect(
      normalizeDeleteCommitMessage("Update", [
        { path: "a.md", delete: true },
        { path: "b.md" },
      ]),
    ).toBe("Update");
  });

  it("leaves an already-prefixed message alone", () => {
    expect(
      normalizeDeleteCommitMessage("deleted: a.md", [
        { path: "a.md", delete: true },
      ]),
    ).toBe("deleted: a.md");
  });

  it("names the path when a single file is deleted", () => {
    expect(
      normalizeDeleteCommitMessage("", [
        { path: "content/a.md", delete: true },
      ]),
    ).toBe("deleted:content/a.md");
  });

  it("prefixes a custom message for a multi-file delete", () => {
    expect(
      normalizeDeleteCommitMessage("spring cleaning", [
        { path: "a.md", delete: true },
        { path: "b.md", delete: true },
      ]),
    ).toBe("deleted: spring cleaning");
  });

  it("falls back to a bare prefix when there is no message", () => {
    expect(
      normalizeDeleteCommitMessage("   ", [
        { path: "a.md", delete: true },
        { path: "b.md", delete: true },
      ]),
    ).toBe("deleted");
  });

  it("does not treat an empty file list as an all-delete commit", () => {
    expect(normalizeDeleteCommitMessage("Update", [])).toBe("Update");
  });
});

describe("getGitAuthDetails", () => {
  it("uses the GitHub App bot identity for GitHub", () => {
    const { name, email } = getGitAuthDetails("Github");
    expect(name).toMatch(/\[bot\]$/);
    expect(email).toMatch(/\[bot\]@users\.noreply\.github\.com$/);
  });

  it("strips non-alphanumerics from the GitLab commit email local part", () => {
    const { email } = getGitAuthDetails("Gitlab");
    expect(email.split("@")[0]).toMatch(/^[a-z0-9]+$/);
  });
});

describe("normalizeSnippetPayload", () => {
  it("passes through the current schema", () => {
    expect(
      normalizeSnippetPayload(
        { label: "Callout", code: "<Callout />", schema: ["title"] },
        "snippets/callout.json",
      ),
    ).toEqual({ label: "Callout", code: "<Callout />", schema: ["title"] });
  });

  it("falls back to the filename for a legacy payload with no name", () => {
    expect(
      normalizeSnippetPayload({ schema: ["title"] }, "snippets/callout.json"),
    ).toEqual({ label: "callout", code: "", schema: ["title"] });
  });

  it("unwraps a legacy nested snippet object", () => {
    expect(
      normalizeSnippetPayload(
        { snippet: { name: "note", label: "Note", schema: ["body", 42] } },
        "snippets/x.json",
      ),
    ).toEqual({ label: "Note", code: "", schema: ["body"] });
  });

  it("rejects a non-object payload", () => {
    expect(normalizeSnippetPayload(null as never, "x.json")).toBeNull();
  });
});

describe("parseSnippetFile", () => {
  it("parses valid JSON", () => {
    expect(parseSnippetFile('{"label":"A","code":"x"}', "a.json")).toEqual({
      label: "A",
      code: "x",
      schema: [],
    });
  });

  it("returns null for blank content", () => {
    expect(parseSnippetFile("   ", "a.json")).toBeNull();
  });

  it("returns null rather than throwing on malformed JSON", () => {
    expect(parseSnippetFile("{not json", "a.json")).toBeNull();
  });
});

describe("isTransientNetworkError", () => {
  it.each([500, 502, 503, 504])("treats %i as transient", (status) => {
    expect(isTransientNetworkError({ status })).toBe(true);
  });

  it("reads the status off a nested response or error object", () => {
    expect(isTransientNetworkError({ response: { status: 503 } })).toBe(true);
    expect(isTransientNetworkError({ error: { status: 502 } })).toBe(true);
  });

  it("matches fetch and network failures by message", () => {
    expect(isTransientNetworkError(new Error("Failed to fetch"))).toBe(true);
    expect(isTransientNetworkError("Network request failed")).toBe(true);
  });

  it("does not treat client errors as transient", () => {
    expect(isTransientNetworkError({ status: 404 })).toBe(false);
    expect(isTransientNetworkError({ status: 422 })).toBe(false);
    expect(isTransientNetworkError(undefined)).toBe(false);
  });
});

describe("toBase64", () => {
  it("round-trips ASCII", () => {
    expect(toBase64("hello")).toBe("aGVsbG8=");
  });

  it("encodes multi-byte characters as UTF-8", () => {
    expect(toBase64("café ☕")).toBe(
      Buffer.from("café ☕", "utf-8").toString("base64"),
    );
  });

  it("encodes an empty string", () => {
    expect(toBase64("")).toBe("");
  });
});
