export const NEXT_BRIDGE_COMPONENT =
  '"use client";\n' +
  'import { useRouter } from "next/navigation";\n' +
  'import { useEffect } from "react";\n' +
  "export default function SitepinsBridge() {\n" +
  "  const router = useRouter();\n" +
  "  useEffect(() => {\n" +
  "    const h = (e: MessageEvent) => {\n" +
  '      if (e.data?.type !== "sp-reload") return;\n' +
  "      try { router.refresh(); } catch { location.reload(); }\n" +
  "    };\n" +
  '    window.addEventListener("message", h);\n' +
  '    return () => window.removeEventListener("message", h);\n' +
  "  }, [router]);\n" +
  "  return null;\n" +
  "}\n";

export const TANSTACK_BRIDGE_COMPONENT =
  'import { useRouter } from "@tanstack/react-router";\n' +
  'import { useEffect } from "react";\n' +
  "export default function SitepinsBridge() {\n" +
  "  const router = useRouter();\n" +
  "  useEffect(() => {\n" +
  "    const h = (e: MessageEvent) => {\n" +
  '      if (e.data?.type !== "sp-reload") return;\n' +
  "      try { router.invalidate(); } catch { location.reload(); }\n" +
  "    };\n" +
  '    window.addEventListener("message", h);\n' +
  '    return () => window.removeEventListener("message", h);\n' +
  "  }, [router]);\n" +
  "  return null;\n" +
  "}\n";

export const NEXT_DOCUMENT_TEMPLATE =
  'import { Html, Head, Main, NextScript } from "next/document";\n' +
  "export default function Document() {\n" +
  "  return (\n" +
  "    <Html>\n" +
  "      <Head />\n" +
  "      <body>\n" +
  "        <Main />\n" +
  "        <NextScript />\n" +
  "      </body>\n" +
  "    </Html>\n" +
  "  );\n" +
  "}\n";

/**
 * Adds the bridge import after the last import and renders `<SitepinsBridge />`
 * inside the document shell. Returns null when the file already has the bridge
 * or has no `</body>`/`</html>` to anchor to.
 *
 * Pure and self-contained on purpose — it is serialized with `toString()` and
 * executed inside the sandbox by {@link buildInjectBridgeSource}, so it must
 * not reference anything outside its own body.
 */
export function injectBridgeComponent(
  source: string,
  importLine: string,
): string | null {
  if (source.includes("SitepinsBridge")) return null;

  const lines = source.split("\n");
  let lastImport = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trimStart().startsWith("import ")) lastImport = i;
  }
  if (lastImport >= 0) lines.splice(lastImport + 1, 0, importLine);
  else lines.unshift(importLine);

  const out = lines.join("\n");
  if (/<\/body>/.test(out))
    return out.replace(/<\/body>/, "<SitepinsBridge /></body>");
  if (/<\/html>/.test(out))
    return out.replace(/<\/html>/, "<SitepinsBridge /></html>");
  return null;
}

/** Node source that applies {@link injectBridgeComponent} to `filePath`. */
export function buildInjectBridgeSource(
  filePath: string,
  importLine: string,
): string {
  return [
    'const fs=require("fs");',
    `const inject=${injectBridgeComponent.toString()};`,
    `const p=${JSON.stringify(filePath)};`,
    `const out=inject(fs.readFileSync(p,"utf8"),${JSON.stringify(importLine)});`,
    'if(out!==null){fs.writeFileSync(p,out);console.log("PATCHED");}',
  ].join("");
}

/**
 * Pages Router fallback: no client component, just an inline listener that
 * reloads the tab. Returns null when the marker is already present.
 */
export function injectPagesDocumentBridge(source: string): string | null {
  if (source.includes("_sp-bridge")) return null;
  if (!/<\/body>/.test(source)) return null;

  const snippet =
    "{/* _sp-bridge */}" +
    '<script dangerouslySetInnerHTML={{ __html: \'window.addEventListener("message",function(e){' +
    'if(e.data&&e.data.type==="sp-reload")location.reload();});\' }} />';

  return source.replace(/<\/body>/, snippet + "</body>");
}

/** Node source that applies {@link injectPagesDocumentBridge} to `filePath`. */
export function buildPagesDocumentBridgeSource(filePath: string): string {
  return [
    'const fs=require("fs");',
    `const inject=${injectPagesDocumentBridge.toString()};`,
    `const p=${JSON.stringify(filePath)};`,
    'const out=inject(fs.readFileSync(p,"utf8"));',
    'if(out!==null){fs.writeFileSync(p,out);console.log("PATCHED");}',
  ].join("");
}
