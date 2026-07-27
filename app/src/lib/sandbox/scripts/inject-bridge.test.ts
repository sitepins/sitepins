import { describe, expect, it } from "vitest";
import {
  buildInjectBridgeSource,
  injectBridgeComponent,
  injectPagesDocumentBridge,
} from "./inject-bridge";

const IMPORT_LINE = 'import SitepinsBridge from "./-sp-bridge";';

const tanstackRoot = [
  'import { createRootRoute, Outlet, Scripts } from "@tanstack/react-router";',
  'import type { ReactNode } from "react";',
  "",
  "export const Route = createRootRoute({ component: RootComponent });",
  "",
  "function RootComponent({ children }: { children: ReactNode }) {",
  "  return (",
  "    <html>",
  "      <body>",
  "        <Outlet />",
  "        <Scripts />",
  "      </body>",
  "    </html>",
  "  );",
  "}",
].join("\n");

describe("injectBridgeComponent", () => {
  it("imports after the last import and renders inside body", () => {
    const out = injectBridgeComponent(tanstackRoot, IMPORT_LINE);
    expect(out).not.toBeNull();
    const lines = out!.split("\n");
    expect(lines[2]).toBe(IMPORT_LINE);
    expect(out).toContain("<SitepinsBridge /></body>");
  });

  it("is idempotent", () => {
    const once = injectBridgeComponent(tanstackRoot, IMPORT_LINE)!;
    expect(injectBridgeComponent(once, IMPORT_LINE)).toBeNull();
  });

  it("falls back to the html tag when there is no body", () => {
    const source =
      "export default function Root() {\n  return <html></html>;\n}";
    expect(injectBridgeComponent(source, IMPORT_LINE)).toContain(
      "<SitepinsBridge /></html>",
    );
  });

  it("returns null when there is nothing to anchor to", () => {
    expect(
      injectBridgeComponent("export const x = 1;", IMPORT_LINE),
    ).toBeNull();
  });

  it("prepends the import when the file has none", () => {
    const out = injectBridgeComponent(
      "<html><body></body></html>",
      IMPORT_LINE,
    );
    expect(out!.startsWith(IMPORT_LINE)).toBe(true);
  });
});

describe("injectPagesDocumentBridge", () => {
  it("inserts the inline listener once", () => {
    const doc = "<Html><body><Main /></body></Html>";
    const out = injectPagesDocumentBridge(doc)!;
    expect(out).toContain("_sp-bridge");
    expect(out).toContain("sp-reload");
    expect(injectPagesDocumentBridge(out)).toBeNull();
  });

  it("returns null without a body tag", () => {
    expect(injectPagesDocumentBridge("<Html></Html>")).toBeNull();
  });
});

describe("buildInjectBridgeSource", () => {
  it("produces a runnable node program", () => {
    const source = buildInjectBridgeSource(
      "src/routes/__root.tsx",
      IMPORT_LINE,
    );
    expect(source).toContain("src/routes/__root.tsx");
    expect(source).toContain("PATCHED");
    expect(() => new Function(source)).not.toThrow();
  });
});
