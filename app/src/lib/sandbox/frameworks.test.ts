import { describe, expect, it } from "vitest";
import { frameworkPort, frameworkSpec } from "./frameworks";

describe("frameworkPort", () => {
  it("resolves known frameworks", () => {
    expect(frameworkPort("hugo")).toBe(1313);
    expect(frameworkPort("astro")).toBe(4321);
    expect(frameworkPort("tanstack")).toBe(3000);
    expect(frameworkPort("gatsby")).toBe(8000);
  });

  it("strips characters the generator string may carry", () => {
    expect(frameworkPort("Hugo")).toBe(1313);
    expect(frameworkPort("hugo_examplesite")).toBe(1313);
  });

  it("falls back to 3000 for missing or unknown generators", () => {
    expect(frameworkPort(undefined)).toBe(3000);
    expect(frameworkPort("undefined")).toBe(3000);
    expect(frameworkPort("elixir")).toBe(3000);
  });
});

describe("frameworkSpec", () => {
  it("marks which frameworks get a bridge", () => {
    expect(frameworkSpec("nextjs")?.bridge).toBe("nextjs");
    expect(frameworkSpec("tanstack")?.bridge).toBe("tanstack");
    expect(frameworkSpec("astro")?.bridge).toBeUndefined();
  });

  it("resolves the legacy 'next' spelling to the nextjs spec", () => {
    expect(frameworkSpec("next")).toEqual(frameworkSpec("nextjs"));
    expect(frameworkSpec("Next")?.bridge).toBe("nextjs");
    expect(frameworkPort("next")).toBe(3000);
  });

  it("marks which frameworks get their package scripts patched", () => {
    const patched = [
      "hugo",
      "hugo_examplesite",
      "jekyll",
      "hexo",
      "nextjs",
      "astro",
    ];
    for (const key of patched) {
      expect(frameworkSpec(key)?.patchScripts).toBe(true);
    }
    expect(frameworkSpec("tanstack")?.patchScripts).toBeUndefined();
  });

  it("keeps the client-side refresh behavior aligned with the bridge", () => {
    expect(frameworkSpec("astro")?.hmrRefreshesContent).toBe(true);
    expect(frameworkSpec("hugo")?.staticGenerator).toBe(true);
    expect(frameworkSpec("tanstack")?.hmrRefreshesContent).toBeUndefined();
    expect(frameworkSpec("nextjs")?.hmrRefreshesContent).toBeUndefined();
  });

  it("returns null for unknown or missing generators", () => {
    expect(frameworkSpec(undefined)).toBeNull();
    expect(frameworkSpec("elixir")).toBeNull();
  });
});
