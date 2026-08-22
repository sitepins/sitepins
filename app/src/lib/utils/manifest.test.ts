import { getManifestFile, getManifestPath } from "@/lib/utils/manifest";
import { APP_VERSION } from "@/lib/version";
import { describe, expect, it } from "vitest";

describe("manifest utils tests", () => {
  it("generates default manifest path when publicPath is not provided or empty", () => {
    expect(getManifestPath()).toBe(".well-known/sitepins.json");
    expect(getManifestPath("")).toBe(".well-known/sitepins.json");
  });

  it("generates correct manifest path with public folder prefix and trims slashes", () => {
    expect(getManifestPath("static")).toBe("static/.well-known/sitepins.json");
    expect(getManifestPath("/public/")).toBe(
      "public/.well-known/sitepins.json",
    );
    expect(getManifestPath("exampleSite/static")).toBe(
      "exampleSite/static/.well-known/sitepins.json",
    );
  });

  it("generates manifest file with matching content and version", () => {
    const file = getManifestFile("public");
    expect(file.path).toBe("public/.well-known/sitepins.json");

    const parsed = JSON.parse(file.content);
    expect(parsed).toEqual({
      cms: "Sitepins",
      generator: "Sitepins CMS",
      version: APP_VERSION,
    });
  });
});
