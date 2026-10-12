import { afterEach, describe, expect, it, vi } from "vitest";

// config-dir.ts derives its folder from env at module load, so each case
// re-imports it after stubbing env.

async function load() {
  vi.resetModules();
  return import("./config-dir");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("config dir", () => {
  it("uses the .<slug> folder", async () => {
    vi.stubEnv("NEXT_PUBLIC_BRAND_SLUG", "Acme CMS");
    const c = await load();
    expect(c.siteConfigPath()).toBe(".acme-cms/config.json");
    expect(c.schemaFolder()).toBe(".acme-cms/schema");
    expect(c.snippetFolder()).toBe(".acme-cms/snippet");
  });

  it("classifies paths in the config folder only", async () => {
    vi.stubEnv("NEXT_PUBLIC_BRAND_SLUG", "acme");
    const c = await load();
    expect(c.isSchemaPath(".acme/schema/blog.json")).toBe(true);
    expect(c.isSnippetPath(".acme/snippet/cta.json")).toBe(true);
    expect(c.isSiteConfigPath("/.acme/config.json")).toBe(true);
    expect(c.isSiteConfigPath(".sitepins/config.json")).toBe(false);
    expect(c.isConfigDirPath(".acme")).toBe(true);
    expect(c.isConfigDirPath("src/content/post.md")).toBe(false);
  });
});
