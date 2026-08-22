import { Session } from "@vercel/sandbox";
import { frameworkSpec } from "./frameworks";
import { buildPatchPackageScriptsSource } from "./scripts/patch-package-scripts";
import {
  getRunScriptCommand,
  hasPackageScript,
  killPort,
  PKG_START,
} from "./session";

const HUGO_ENV_PREFIX =
  "export GOROOT=$PWD/go GOPATH=$PWD/gopath PATH=$PWD/go/bin:$PWD/node_modules/.bin:$PATH && ";

const HUGO_FALLBACK_CMD =
  'hugo serve --bind 0.0.0.0 --liveReloadPort 443 --buildDrafts --buildFuture --appendPort=false --baseURL "$SITEPINS_BASE_URL"';

export async function patchPackageScripts(
  session: Session,
  signal?: AbortSignal,
): Promise<boolean> {
  const result = await session.runCommand({
    cmd: "node",
    args: ["-e", buildPatchPackageScriptsSource()],
    signal,
  });
  return (await result.stdout()).trim() === "PATCHED";
}

async function hugoDevCommand(
  session: Session,
  pkgManager: string,
  variant: "hugo" | "hugo_examplesite",
  signal?: AbortSignal,
): Promise<string> {
  if (variant === "hugo_examplesite") {
    return [
      "THEME_NAME=$(node -e \"const p=require('./package.json');console.log(p.name)\")",
      'PARENT=$(dirname "$PWD")',
      '[ -e "$PARENT/$THEME_NAME" ] || ln -sfn "$PWD" "$PARENT/$THEME_NAME"',
      getRunScriptCommand(pkgManager, "dev:example").join(" "),
    ].join(" && ");
  }

  return (await hasPackageScript(session, "dev", signal))
    ? getRunScriptCommand(pkgManager, "dev").join(" ")
    : HUGO_FALLBACK_CMD;
}

/**
 * Neither Vite nor Rsbuild reads PORT/HOST from the environment, and TanStack
 * Start's templates hardcode `server.port`, so host and port must arrive as
 * CLI flags. Run the dev binary directly, falling back to the package script.
 */
async function tanstackDevCommand(
  session: Session,
  fallbackCmd: string,
  signal?: AbortSignal,
): Promise<string> {
  const probe = await session.runCommand({
    cmd: "sh",
    args: [
      "-c",
      // A vinxi project (legacy app.config.ts) ships a vite binary too, but
      // running it directly would bypass vinxi's own server.
      "if [ -f app.config.ts ] || [ -f app.config.js ] || [ -f app.config.mjs ]; " +
        "then echo SCRIPT; " +
        "elif [ -x ./node_modules/.bin/vite ]; then echo VITE; " +
        "elif [ -x ./node_modules/.bin/rsbuild ]; then echo RSBUILD; " +
        "else echo SCRIPT; fi",
    ],
    signal,
  });

  switch ((await probe.stdout()).trim()) {
    case "VITE":
      return "./node_modules/.bin/vite dev --host 0.0.0.0 --port $PORT --strictPort";
    case "RSBUILD":
      return "./node_modules/.bin/rsbuild dev --host 0.0.0.0 --port $PORT";
    default:
      return fallbackCmd;
  }
}

export async function startDevServer(
  session: Session,
  pkgManager: string,
  port: number,
  generator?: string,
  previewUrl?: string,
  signal?: AbortSignal,
) {
  const spec = frameworkSpec(generator);

  if (spec?.patchScripts) {
    await patchPackageScripts(session, signal);
  }

  let fullCmd = PKG_START[pkgManager].join(" ");
  if (spec?.devCommand === "tanstack") {
    fullCmd = await tanstackDevCommand(session, fullCmd, signal);
  } else if (spec?.devCommand) {
    fullCmd = await hugoDevCommand(
      session,
      pkgManager,
      spec.devCommand,
      signal,
    );
  }

  const envPrefix = spec?.needsHugoToolchain ? HUGO_ENV_PREFIX : "";
  const shellCmd = `${envPrefix}${fullCmd} > /tmp/devserver.log 2>&1`;

  await session.runCommand({
    cmd: "sh",
    args: ["-c", shellCmd],
    env: {
      PORT: String(port),
      HOST: "0.0.0.0",
      HOSTNAME: "0.0.0.0",
      SITEPINS_BASE_URL: previewUrl ?? "",
      __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS: ".vercel.run",
      ...(spec?.draftEnv && {
        BUILD_DRAFTS: "true",
        BUILD_FUTURE: "true",
      }),
    },
    detached: true,
    signal,
  });
}

export async function restartDevServer(
  session: Session,
  pkgManager: string,
  port: number,
  generator?: string,
  previewUrl?: string,
  signal?: AbortSignal,
) {
  await killPort(session, port, signal);
  await startDevServer(
    session,
    pkgManager,
    port,
    generator,
    previewUrl,
    signal,
  );
}

/** Downloads and installs the Hugo extended binary if not already in PATH. */
export async function installHugoIfNeeded(
  session: Session,
  signal?: AbortSignal,
): Promise<boolean> {
  const check = await session.runCommand({
    cmd: "sh",
    args: [
      "-c",
      "(which hugo 2>/dev/null || [ -x ./node_modules/.bin/hugo ]) && echo OK || echo MISSING",
    ],
    signal,
  });
  if ((await check.stdout()).trim().includes("OK")) return false;

  const verCmd = await session.runCommand({
    cmd: "node",
    args: [
      "-e",
      "const h=require('https');" +
        "h.get({hostname:'api.github.com',path:'/repos/gohugoio/hugo/releases/latest'," +
        "headers:{'User-Agent':'sitepins-sandbox'}},r=>{let d='';r.on('data',c=>d+=c);" +
        "r.on('end',()=>{try{const t=JSON.parse(d).tag_name||'';console.log(t.replace(/^v/,''));}catch{console.log('');}})})" +
        ".on('error',()=>console.log(''));",
    ],
    signal,
  });
  const ver = (await verCmd.stdout()).trim() || "0.158.0";

  const url =
    `https://github.com/gohugoio/hugo/releases/download/v${ver}/` +
    `hugo_extended_withdeploy_${ver}_linux-amd64.tar.gz`;

  await session.runCommand({
    cmd: "sh",
    args: [
      "-c",
      `mkdir -p ./node_modules/.bin && curl -fsSL "${url}" | tar -xzf - -C ./node_modules/.bin hugo && chmod +x ./node_modules/.bin/hugo`,
    ],
    signal,
  });
  return true;
}

/** Installs Go to ./go/ in the project directory. */
export async function installGoIfNeeded(
  session: Session,
  signal?: AbortSignal,
): Promise<void> {
  const check = await session.runCommand({
    cmd: "sh",
    args: [
      "-c",
      "(which go 2>/dev/null || [ -x ./go/bin/go ]) && echo OK || echo MISSING",
    ],
    signal,
  });
  if ((await check.stdout()).trim().includes("OK")) return;

  await session.runCommand({
    cmd: "sh",
    args: [
      "-c",
      "curl -fsSL https://go.dev/dl/go1.25.1.linux-amd64.tar.gz | tar -xzf - -C ./",
    ],
    signal,
  });
}
