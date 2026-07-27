import { describe, expect, it } from "vitest";
import {
  applyDevScriptFlags,
  buildPatchPackageScriptsSource,
} from "./patch-package-scripts";

const apply = (dev: string) => applyDevScriptFlags({ dev });

describe("applyDevScriptFlags", () => {
  it("binds hugo to 0.0.0.0 and enables drafts, future and livereload", () => {
    const { scripts, changed } = apply("hugo server");
    expect(changed).toBe(true);
    expect(scripts.dev).toContain("--bind 0.0.0.0");
    expect(scripts.dev).toContain("--liveReloadPort 443");
    expect(scripts.dev).toContain("--buildDrafts");
    expect(scripts.dev).toContain("--buildFuture");
    expect(scripts.dev).toContain("--baseURL $SITEPINS_BASE_URL");
  });

  it("patches jekyll and hexo", () => {
    expect(apply("jekyll serve").scripts.dev).toContain("--host 0.0.0.0");
    expect(apply("jekyll serve").scripts.dev).toContain("--drafts");
    expect(apply("hexo server").scripts.dev).toContain("--drafts");
  });

  it("patches astro and next", () => {
    expect(apply("astro dev").scripts.dev).toBe(
      "astro dev --buildFuture --buildDrafts",
    );
    expect(apply("next dev").scripts.dev).toBe(
      "BUILD_DRAFTS=true BUILD_FUTURE=true next dev",
    );
  });

  it("leaves unrelated scripts alone", () => {
    expect(apply("vite dev").changed).toBe(false);
    expect(apply("astro build").changed).toBe(false);
    expect(applyDevScriptFlags({ build: "next build" }).changed).toBe(false);
  });

  it("does not double-apply flags", () => {
    const first = apply("hugo server");
    const second = applyDevScriptFlags(first.scripts);
    expect(second.changed).toBe(false);
    expect(second.scripts).toEqual(first.scripts);
  });

  it("keeps a flag the author already set", () => {
    const { scripts } = apply("hugo server --bind 127.0.0.1");
    expect(scripts.dev).toContain("--bind 127.0.0.1");
    expect(scripts.dev).not.toContain("--bind 0.0.0.0");
  });

  it("does not mutate its input", () => {
    const input = { dev: "next dev" };
    applyDevScriptFlags(input);
    expect(input.dev).toBe("next dev");
  });
});

describe("buildPatchPackageScriptsSource", () => {
  it("produces a runnable node program carrying the patch logic", () => {
    const source = buildPatchPackageScriptsSource();
    expect(source).toContain("package.json");
    expect(source).toContain("PATCHED");
    expect(() => new Function(source)).not.toThrow();
  });
});
