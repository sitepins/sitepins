import { TTree } from "@/types";
import { describe, expect, it } from "vitest";
import detectFramework, {
  refineFrameworkFromPackageJson,
} from "./framework-detector";

const tree = (...paths: string[]): TTree[] => paths.map((path) => ({ path }));

describe("detectFramework", () => {
  describe("tanstack", () => {
    it("detects a Vite-based TanStack Start project", () => {
      expect(
        detectFramework(
          tree(
            "package.json",
            "vite.config.ts",
            "src/router.tsx",
            "src/routeTree.gen.ts",
            "src/routes/__root.tsx",
          ),
        ),
      ).toBe("tanstack");
    });

    it("detects the legacy app.config.ts layout", () => {
      expect(
        detectFramework(
          tree("package.json", "app.config.ts", "src/routes/__root.tsx"),
        ),
      ).toBe("tanstack");
    });

    it("detects an Rsbuild-based project", () => {
      expect(
        detectFramework(
          tree("package.json", "rsbuild.config.ts", "src/routeTree.gen.ts"),
        ),
      ).toBe("tanstack");
    });

    it("detects a project nested in a monorepo package", () => {
      expect(
        detectFramework(
          tree(
            "apps/web/vite.config.ts",
            "apps/web/src/routes/__root.tsx",
            "apps/web/src/routeTree.gen.ts",
          ),
        ),
      ).toBe("tanstack");
    });

    it("does not match a plain Vite app without TanStack routing", () => {
      expect(
        detectFramework(
          tree("package.json", "vite.config.ts", "src/main.tsx", "index.html"),
        ),
      ).toBeNull();
    });

    it("does not match on the routing artifact alone", () => {
      expect(detectFramework(tree("src/routes/__root.tsx"))).toBeNull();
    });
  });

  describe("existing frameworks", () => {
    it("detects nextjs", () => {
      expect(detectFramework(tree("package.json", "next.config.ts"))).toBe(
        "nextjs",
      );
    });

    it("detects astro", () => {
      expect(detectFramework(tree("package.json", "astro.config.mjs"))).toBe(
        "astro",
      );
    });

    it("detects hugo", () => {
      expect(detectFramework(tree("hugo.toml", "content/_index.md"))).toBe(
        "hugo",
      );
    });

    it("detects a nested hugo config", () => {
      expect(detectFramework(tree("config/_default/hugo.toml"))).toBe("hugo");
    });

    it("detects hugo_examplesite when an exampleSite folder exists", () => {
      expect(
        detectFramework(
          tree("hugo.toml", "exampleSite/hugo.toml", "exampleSite/content"),
        ),
      ).toBe("hugo_examplesite");
    });

    it("returns null for an unknown repository", () => {
      expect(detectFramework(tree("README.md", "index.html"))).toBeNull();
    });
  });
});

describe("refineFrameworkFromPackageJson", () => {
  const tanstackPkg = JSON.stringify({
    dependencies: { "@tanstack/react-start": "^1.0.0" },
  });

  it("upgrades a null detection using dependencies", () => {
    expect(refineFrameworkFromPackageJson(null, tanstackPkg)).toBe("tanstack");
  });

  it("keeps a confident path match", () => {
    expect(refineFrameworkFromPackageJson("hugo", tanstackPkg)).toBe("hugo");
  });

  it("confirms an ambiguous match", () => {
    expect(refineFrameworkFromPackageJson("tanstack", tanstackPkg)).toBe(
      "tanstack",
    );
  });

  it("rejects an ambiguous match when no TanStack dependency exists", () => {
    const pkg = JSON.stringify({ dependencies: { next: "^15.0.0" } });
    expect(refineFrameworkFromPackageJson("tanstack", pkg)).toBe("nextjs");
  });

  it("reads devDependencies too", () => {
    const pkg = JSON.stringify({
      devDependencies: { "@tanstack/solid-start": "^1.0.0" },
    });
    expect(refineFrameworkFromPackageJson(null, pkg)).toBe("tanstack");
  });

  it("passes the framework through when package.json is missing or invalid", () => {
    expect(refineFrameworkFromPackageJson("tanstack", null)).toBe("tanstack");
    expect(refineFrameworkFromPackageJson("tanstack", "{not json")).toBe(
      "tanstack",
    );
  });
});
