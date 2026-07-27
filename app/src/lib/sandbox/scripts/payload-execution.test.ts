import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildInjectBridgeSource } from "./inject-bridge";
import { buildPatchPackageScriptsSource } from "./patch-package-scripts";

describe("serialized payloads run under plain node", () => {
  it("patches package.json in a real node process", () => {
    const dir = mkdtempSync(join(tmpdir(), "sp-patch-"));
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ scripts: { dev: "next dev" } }),
    );
    const out = execFileSync("node", ["-e", buildPatchPackageScriptsSource()], {
      cwd: dir,
      encoding: "utf8",
    });
    expect(out.trim()).toBe("PATCHED");
    expect(
      JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).scripts.dev,
    ).toBe("BUILD_DRAFTS=true BUILD_FUTURE=true next dev");
  });

  it("injects the bridge in a real node process", () => {
    const dir = mkdtempSync(join(tmpdir(), "sp-bridge-"));
    const file = join(dir, "__root.tsx");
    writeFileSync(
      file,
      'import { Outlet } from "@tanstack/react-router";\nexport default () => <html><body><Outlet /></body></html>;\n',
    );
    const out = execFileSync(
      "node",
      [
        "-e",
        buildInjectBridgeSource(
          file,
          'import SitepinsBridge from "./-sp-bridge";',
        ),
      ],
      { encoding: "utf8" },
    );
    expect(out.trim()).toBe("PATCHED");
    const patched = readFileSync(file, "utf8");
    expect(patched).toContain('import SitepinsBridge from "./-sp-bridge";');
    expect(patched).toContain("<SitepinsBridge /></body>");
  });
});
