import rootPkg from "@/../../package.json";
import manifestJson from "@/config/manifest.json";
import {
  APP_VERSION,
  getSitepinsManifest,
  sitepinsManifest,
} from "@/lib/version";
import appPkg from "../../package.json";
import { describe, expect, it } from "vitest";

describe("Version consistency & helper tests", () => {
  it("exports a valid APP_VERSION matching package.json", () => {
    expect(APP_VERSION).toBeDefined();
    expect(APP_VERSION).toBe(appPkg.version);
    expect(APP_VERSION).toBe(rootPkg.version);
  });

  it("returns the correct sitepins manifest from helper", () => {
    const manifest = getSitepinsManifest();
    expect(manifest).toEqual({
      cms: "Sitepins",
      generator: "Sitepins CMS",
      version: APP_VERSION,
    });
  });

  it("exports sitepinsManifest matching getSitepinsManifest", () => {
    expect(sitepinsManifest).toEqual(getSitepinsManifest());
  });

  it("keeps config manifest.json version consistent with APP_VERSION", () => {
    expect(manifestJson.version).toBe(APP_VERSION);
    expect(manifestJson.cms).toBe("Sitepins");
    expect(manifestJson.generator).toBe("Sitepins CMS");
  });
});
