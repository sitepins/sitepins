import { Session } from "@vercel/sandbox";
import { frameworkSpec } from "./frameworks";
import {
  buildInjectBridgeSource,
  buildPagesDocumentBridgeSource,
  NEXT_BRIDGE_COMPONENT,
  NEXT_DOCUMENT_TEMPLATE,
  TANSTACK_BRIDGE_COMPONENT,
} from "./scripts/inject-bridge";
import { writeFileViaShell } from "./session";

function dirOf(filePath: string): string {
  return filePath.includes("/")
    ? filePath.split("/").slice(0, -1).join("/")
    : ".";
}

/** Injects a client component that calls router.refresh() on postMessage. */
async function ensureNextjsBridge(
  session: Session,
  signal?: AbortSignal,
): Promise<boolean> {
  const appResult = await session.runCommand({
    cmd: "sh",
    args: [
      "-c",
      'p=$(find app src/app -maxdepth 1 -type f -name "layout.*" 2>/dev/null | head -1); ' +
        '[ -z "$p" ] && echo NOTFOUND && exit 0; ' +
        'd=$(dirname "$p"); ' +
        'if grep -q SitepinsBridge "$p" && [ -f "$d/_sp-bridge.tsx" ] && grep -q "router.refresh" "$d/_sp-bridge.tsx"; ' +
        'then echo "DONE"; else echo "PATCH:$p"; fi',
    ],
    signal,
  });
  const appOut = (await appResult.stdout()).trim();

  if (appOut === "DONE") return false;

  if (appOut.startsWith("PATCH:")) {
    const layoutPath = appOut.replace(/^PATCH:/, "");

    await writeFileViaShell(
      session,
      `${dirOf(layoutPath)}/_sp-bridge.tsx`,
      NEXT_BRIDGE_COMPONENT,
      signal,
    );
    await session.runCommand({
      cmd: "node",
      args: [
        "-e",
        buildInjectBridgeSource(
          layoutPath,
          'import SitepinsBridge from "./_sp-bridge";',
        ),
      ],
      signal,
    });
    return true;
  }

  const pagesResult = await session.runCommand({
    cmd: "sh",
    args: [
      "-c",
      "dir=$(find pages src/pages -maxdepth 0 -type d 2>/dev/null | head -1); " +
        '[ -z "$dir" ] && echo NOLAYOUT && exit 0; ' +
        'p=$(find "$dir" -maxdepth 1 -type f -name "_document.*" 2>/dev/null | head -1); ' +
        '[ -n "$p" ] && { grep -q "_sp-bridge" "$p" && echo DONE || echo "PATCH:$p"; } ' +
        '|| echo "CREATE:$dir"',
    ],
    signal,
  });
  const pagesOut = (await pagesResult.stdout()).trim();
  if (pagesOut === "NOLAYOUT" || pagesOut === "DONE") return false;

  let documentPath: string;
  if (pagesOut.startsWith("CREATE:")) {
    documentPath = `${pagesOut.replace(/^CREATE:/, "")}/_document.tsx`;
    await writeFileViaShell(
      session,
      documentPath,
      NEXT_DOCUMENT_TEMPLATE,
      signal,
    );
  } else {
    documentPath = pagesOut.replace(/^PATCH:/, "");
  }

  await session.runCommand({
    cmd: "node",
    args: ["-e", buildPagesDocumentBridgeSource(documentPath)],
    signal,
  });
  return true;
}

/**
 * TanStack Start counterpart: patches the root route with a component that
 * calls router.invalidate() on postMessage, re-running loaders and server
 * functions.
 */
async function ensureTanstackBridge(
  session: Session,
  signal?: AbortSignal,
): Promise<boolean> {
  const probe = await session.runCommand({
    cmd: "sh",
    args: [
      "-c",
      // Solid Start has no hooks API — React projects only.
      'grep -q "@tanstack/react-router" package.json 2>/dev/null || { echo UNSUPPORTED; exit 0; }; ' +
        'p=$(find src/routes app/routes routes -maxdepth 1 -type f -name "__root.*" 2>/dev/null | head -1); ' +
        '[ -z "$p" ] && echo NOTFOUND && exit 0; ' +
        'd=$(dirname "$p"); ' +
        'if grep -q SitepinsBridge "$p" && [ -f "$d/-sp-bridge.tsx" ]; ' +
        'then echo "DONE"; else echo "PATCH:$p"; fi',
    ],
    signal,
  });
  const out = (await probe.stdout()).trim();
  if (!out.startsWith("PATCH:")) return false;

  const rootPath = out.replace(/^PATCH:/, "");

  // The `-` prefix keeps the file out of the generated route tree.
  await writeFileViaShell(
    session,
    `${dirOf(rootPath)}/-sp-bridge.tsx`,
    TANSTACK_BRIDGE_COMPONENT,
    signal,
  );

  const patched = await session.runCommand({
    cmd: "node",
    args: [
      "-e",
      buildInjectBridgeSource(
        rootPath,
        'import SitepinsBridge from "./-sp-bridge";',
      ),
    ],
    signal,
  });
  return (await patched.stdout()).trim() === "PATCHED";
}

// Returns true when the bridge was freshly injected — the client must then do
// one full reload before postMessage signals reach it.
export async function ensureReloadBridge(
  generator: string | undefined,
  session: Session,
  signal?: AbortSignal,
): Promise<boolean> {
  const bridge = frameworkSpec(generator)?.bridge;
  if (!bridge) return false;
  return bridge === "tanstack"
    ? ensureTanstackBridge(session, signal)
    : ensureNextjsBridge(session, signal);
}
