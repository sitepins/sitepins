import { afterEach, describe, expect, it, vi } from "vitest";

// brand.ts reads env at module load, so each case re-imports after stubbing.

async function load() {
  vi.resetModules();
  return import("./configDir.js");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("configDir", () => {
  it("uses the .<slug> folder only", async () => {
    vi.stubEnv("BRAND_SLUG", "acme");
    const c = await load();
    expect(c.configPaths().config).toBe(".acme/config.json");
    expect(c.isSchemaDirPath(".acme/schema/blog.json")).toBe(true);
    expect(c.isSnippetDirPath(".acme/snippet/cta.json")).toBe(true);
    expect(c.isConfigDirPath(".sitepins/config.json")).toBe(false);
    expect(c.isConfigDirPath("content/post.md")).toBe(false);
  });
});
