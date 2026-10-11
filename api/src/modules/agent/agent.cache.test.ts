import { describe, expect, it } from "vitest";
import { LruCache } from "./agent.cache";
import { globToRegExp } from "./agent.glob";

describe("LruCache", () => {
  it("evicts the least recently used entry", () => {
    const cache = new LruCache<string, number>({ maxEntries: 2 });
    cache.set("a", 1);
    cache.set("b", 2);
    cache.get("a");
    cache.set("c", 3);
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBe(1);
    expect(cache.get("c")).toBe(3);
  });

  it("evicts by total size and skips values bigger than the cap", () => {
    const cache = new LruCache<string, Buffer>({
      maxEntries: 10,
      maxBytes: 10,
      sizeOf: (b) => b.length,
    });
    cache.set("a", Buffer.alloc(6));
    cache.set("b", Buffer.alloc(6));
    expect(cache.get("a")).toBeUndefined();
    cache.set("huge", Buffer.alloc(11));
    expect(cache.get("huge")).toBeUndefined();
    expect(cache.get("b")).toBeDefined();
  });

  it("expires entries after the TTL", () => {
    const cache = new LruCache<string, number>({ maxEntries: 2, ttlMs: -1 });
    cache.set("a", 1);
    expect(cache.get("a")).toBeUndefined();
  });
});

describe("globToRegExp", () => {
  it.each([
    ["*.md", "a.md", true],
    ["*.md", "blog/a.md", false],
    ["**/*.md", "a.md", true],
    ["**/*.md", "blog/2024/a.md", true],
    ["blog/*.{md,mdx}", "blog/a.mdx", true],
    ["blog/?.md", "blog/ab.md", false],
    ["a+b(c).md", "a+b(c).md", true],
  ])("%s against %s → %s", (glob, path, expected) => {
    expect(globToRegExp(glob).test(path)).toBe(expected);
  });

  it("rejects an unclosed brace", () => {
    expect(() => globToRegExp("{a,b")).toThrow(/Unclosed/);
  });
});
