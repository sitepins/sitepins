import { getAuth } from "@/lib/auth/auth-server";
import { isGitLabProvider } from "@/lib/utils/provider-checker";
import { cleanVercelFetch, getSandboxAuth } from "@/lib/vercel-sandbox-auth";
import { Sandbox, Session } from "@vercel/sandbox";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 600;

// ── Constants ────────────────────────────────────────────────────────────────

const FRAMEWORK_PORT: Record<string, number> = {
  nextjs: 3000,
  next: 3000,
  gatsby: 8000,
  hugo: 1313,
  jekyll: 4000,
  astro: 4321,
  nuxt: 3000,
  remix: 3000,
  sveltekit: 5173,
  vite: 5173,
  react: 5173,
  hugo_examplesite: 1313,
};
const PKG_START: Record<string, string[]> = {
  pnpm: ["pnpm", "run", "dev"],
  yarn: ["yarn", "dev"],
  bun: ["bun", "run", "dev"],
  npm: ["npm", "run", "dev"],
};
const PKG_INSTALL: Record<string, string[]> = {
  pnpm: ["pnpm", "install"],
  yarn: ["yarn", "install"],
  bun: ["bun", "install"],
  npm: ["npm", "install"],
};
const SERVER_READY_TIMEOUT_MS = 180_000;
const COLD_START_TIMEOUT_MS = 20 * 60 * 1000;

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "";
const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET ?? "";

function internalHeaders(cookieHeader: string): HeadersInit {
  if (!INTERNAL_SECRET)
    throw new Error("INTERNAL_API_SECRET env var is not set");
  return {
    "Content-Type": "application/json",
    cookie: cookieHeader,
    "x-internal-secret": INTERNAL_SECRET,
  };
}

type CachedPreview = {
  sandboxName?: string;
  commitSha?: string;
};

async function getCachedPreview(
  projectId: string,
  cookieHeader: string,
): Promise<CachedPreview> {
  try {
    const res = await fetch(
      `${BACKEND}/project-preview/${encodeURIComponent(projectId)}`,
      { headers: internalHeaders(cookieHeader), cache: "no-store" },
    );
    if (!res.ok) return {};
    const body = await res.json();
    const result = body?.result;
    return {
      sandboxName: result?.sandbox_name || undefined,
      commitSha: result?.commit_sha || undefined,
    };
  } catch {
    return {};
  }
}

async function syncSandboxPreviewState(
  projectId: string,
  state: { sandbox_name?: string; preview_url?: string; commit_sha?: string },
  cookieHeader: string,
): Promise<void> {
  try {
    await fetch(`${BACKEND}/project-preview/${encodeURIComponent(projectId)}`, {
      method: "PUT",
      headers: internalHeaders(cookieHeader),
      body: JSON.stringify(state),
    });
  } catch (e) {
    console.error("[sandbox] failed to sync preview state:", e);
  }
}

// ── Sandbox helpers ──────────────────────────────────────────────────────────

/**
 * Writes a file in the sandbox using a shell pipeline (base64 → file).
 */
async function writeFileViaShell(
  session: Session,
  path: string,
  content: string,
  signal?: AbortSignal,
): Promise<void> {
  const b64 = Buffer.from(content, "utf8").toString("base64");
  if (path.includes("'")) {
    throw new Error(
      "[sandbox] refused to write path with single-quote: " + path,
    );
  }
  const script = `mkdir -p "$(dirname '${path}')" && printf '%s' '${b64}' | base64 -d > '${path}'`;
  const result = await session.runCommand({
    cmd: "sh",
    args: ["-c", script],
    signal,
  });
  if (result.exitCode !== 0) {
    const stderr = await result.stderr();
    throw new Error(
      `[sandbox] writeFileViaShell failed (${result.exitCode}): ${stderr.slice(0, 300)}`,
    );
  }
}

async function detectPackageManager(
  session: Session,
  signal?: AbortSignal,
): Promise<string> {
  const result = await session.runCommand({
    cmd: "sh",
    args: [
      "-c",
      "if [ -f pnpm-lock.yaml ]; then echo pnpm; elif [ -f yarn.lock ]; then echo yarn; elif [ -f bun.lockb ]; then echo bun; else echo npm; fi",
    ],
    signal,
  });
  const mgr = (await result.stdout()).trim();
  return ["pnpm", "yarn", "bun", "npm"].includes(mgr) ? mgr : "npm";
}

function getRunScriptCommand(pkgManager: string, script: string): string[] {
  if (pkgManager === "pnpm") return ["pnpm", "run", script];
  if (pkgManager === "yarn") return ["yarn", script];
  if (pkgManager === "bun") return ["bun", "run", script];
  return ["npm", "run", script];
}

async function hasPackageScript(
  session: Session,
  scriptName: string,
  signal?: AbortSignal,
): Promise<boolean> {
  const result = await session.runCommand({
    cmd: "node",
    args: [
      "-e",
      [
        "const fs=require('fs');",
        "try{",
        "  const p=JSON.parse(fs.readFileSync('package.json','utf8'));",
        `  const v=p?.scripts?.[${JSON.stringify(scriptName)}];`,
        "  console.log(typeof v==='string' && v.trim() ? 'YES' : 'NO');",
        "}catch{",
        "  console.log('NO');",
        "}",
      ].join(""),
    ],
    signal,
  });
  return (await result.stdout()).trim() === "YES";
}

async function waitForServer(
  url: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (signal?.aborted) return false;
    try {
      const r = await fetch(url, { method: "HEAD", signal });
      if (r.ok || r.status < 500) return true;
    } catch {
      /* still starting */
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

async function getLatestCommitSha(
  provider: string,
  repository: string,
  branch: string,
  token?: string,
  signal?: AbortSignal,
): Promise<string | null> {
  try {
    if (isGitLabProvider(provider)) {
      const url = `https://gitlab.com/api/v4/projects/${encodeURIComponent(repository)}/repository/commits/${encodeURIComponent(branch)}?t=${Date.now()}`;
      const res = await fetch(url, {
        headers: token ? { "PRIVATE-TOKEN": token } : {},
        cache: "no-store",
        signal,
      });
      if (res.ok) return (await res.json()).id || null;
    } else {
      const url = `https://api.github.com/repos/${repository}/commits/${encodeURIComponent(branch)}?t=${Date.now()}`;
      const res = await fetch(url, {
        headers: token
          ? {
              Authorization: `token ${token}`,
              Accept: "application/vnd.github.v3+json",
              "User-Agent": "Sitepins-App",
            }
          : {
              Accept: "application/vnd.github.v3+json",
              "User-Agent": "Sitepins-App",
            },
        cache: "no-store",
        signal,
      });
      if (res.ok) return (await res.json()).sha || null;
    }
  } catch (e) {
    console.error("[sandbox] getLatestCommitSha:", e);
  }
  return null;
}

async function installDeps(
  session: Session,
  pkgManager: string,
  signal?: AbortSignal,
): Promise<string> {
  try {
    await session.runCommand({ cmd: "corepack", args: ["enable"], signal });
  } catch {
    /* ok */
  }
  let active = pkgManager;
  const result = await session.runCommand({
    cmd: PKG_INSTALL[active][0],
    args: PKG_INSTALL[active].slice(1),
    signal,
  });
  if (result.exitCode !== 0) {
    console.warn(`[sandbox] ${active} install failed, falling back to npm`);
    active = "npm";
    const fallback = await session.runCommand({
      cmd: "npm",
      args: ["install"],
      signal,
    });
    if (fallback.exitCode !== 0) {
      const stderr = await fallback.stderr();
      const relevant = stderr
        .split("\n")
        .filter((l) => /error|ERR!/i.test(l))
        .slice(0, 5)
        .join("\n");
      throw new Error(
        `Dependency install failed:\n${relevant || stderr.slice(0, 400)}`,
      );
    }
  }
  return active;
}

/**
 * Writes a tiny client component (_sp-bridge.tsx) into the sandbox's Next.js layout.
 */
async function ensureSitepinsBridge(
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
    const layoutDir = layoutPath.includes("/")
      ? layoutPath.split("/").slice(0, -1).join("/")
      : ".";

    const bridgeContent =
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

    await writeFileViaShell(
      session,
      `${layoutDir}/_sp-bridge.tsx`,
      bridgeContent,
      signal,
    );

    const patchScript = [
      `const fs=require("fs");`,
      `let c=fs.readFileSync(${JSON.stringify(layoutPath)},"utf8");`,
      `if(c.includes("SitepinsBridge"))process.exit(0);`,
      `const imp=${JSON.stringify('import SitepinsBridge from "./_sp-bridge";')};`,
      `const lines=c.split("\\n");`,
      `let li=-1;for(let i=0;i<lines.length;i++){if(lines[i].trimStart().startsWith("import "))li=i;}`,
      `if(li>=0)lines.splice(li+1,0,imp);else lines.unshift(imp);`,
      `c=lines.join("\\n");`,
      `c=c.replace(/<\\/body>/,"<SitepinsBridge /></body>");`,
      `if(!c.includes("<SitepinsBridge />"))c=c.replace(/<\\/html>/,"<SitepinsBridge /></html>");`,
      `fs.writeFileSync(${JSON.stringify(layoutPath)},c);`,
    ].join("");

    await session.runCommand({
      cmd: "node",
      args: ["-e", patchScript],
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
    const pagesDir = pagesOut.replace(/^CREATE:/, "");
    documentPath = `${pagesDir}/_document.tsx`;
    await writeFileViaShell(
      session,
      documentPath,
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
        "}\n",
      signal,
    );
  } else {
    documentPath = pagesOut.replace(/^PATCH:/, "");
  }

  const pagesDocScript = [
    `const fs=require("fs");`,
    `let c=fs.readFileSync(${JSON.stringify(documentPath)},"utf8");`,
    `if(c.includes("_sp-bridge"))process.exit(0);`,
    `const sc=${JSON.stringify(
      "{/* _sp-bridge */}" +
        '<script dangerouslySetInnerHTML={{ __html: \'window.addEventListener("message",function(e){' +
        'if(e.data&&e.data.type==="sp-reload")location.reload();});\' }} />',
    )};`,
    `c=c.replace(/<\\/body>/,sc+"</body>");`,
    `fs.writeFileSync(${JSON.stringify(documentPath)},c);`,
  ].join("");

  await session.runCommand({
    cmd: "node",
    args: ["-e", pagesDocScript],
    signal,
  });
  return true;
}

async function patchPackageScripts(
  session: Session,
  signal?: AbortSignal,
): Promise<boolean> {
  const result = await session.runCommand({
    cmd: "node",
    args: [
      "-e",
      [
        "const fs=require('fs');",
        "try{",
        "  const p=JSON.parse(fs.readFileSync('package.json','utf8'));",
        "  if(p.scripts){",
        "    let changed=false;",
        "    for(const k of Object.keys(p.scripts)){",
        "      const s=p.scripts[k];",
        // Hugo
        "      if(/hugo\\s+(server|serve)/.test(s)){",
        "        if(!/--bind/.test(s)){",
        "          p.scripts[k]=p.scripts[k].replace(/hugo(\\s+(?:server|serve))/g,'hugo$1 --bind 0.0.0.0');",
        "          changed=true;",
        "        }",
        "        if(!/--liveReloadPort/.test(p.scripts[k])){",
        "          p.scripts[k]=p.scripts[k].replace(/hugo(\\s+(?:server|serve))/g,'hugo$1 --liveReloadPort 443');",
        "          changed=true;",
        "        }",
        "        if(!/--buildDrafts/.test(p.scripts[k])){",
        "          p.scripts[k]=p.scripts[k].replace(/hugo(\\s+(?:server|serve))/g,'hugo$1 --buildDrafts');",
        "          changed=true;",
        "        }",
        "        if(!/--buildFuture/.test(p.scripts[k])){",
        "          p.scripts[k]=p.scripts[k].replace(/hugo(\\s+(?:server|serve))/g,'hugo$1 --buildFuture');",
        "          changed=true;",
        "        }",
        "        if(!/--baseURL/.test(p.scripts[k])){",
        "          p.scripts[k]=p.scripts[k].replace(/hugo(\\s+(?:server|serve))/g,'hugo$1 --appendPort=false --baseURL $SITEPINS_BASE_URL');",
        "          changed=true;",
        "        }",
        "      }",
        // Jekyll
        "      if(/jekyll\\s+serve/.test(s) || /jekyll\\s+s(\\s|$)/.test(s)){",
        "        if(!/--host/.test(s) && !/-h(\\s|$)/.test(s)){",
        "          p.scripts[k]=p.scripts[k].replace(/jekyll(\\s+serve|\\s+s)/g,'jekyll$1 --host 0.0.0.0');",
        "          changed=true;",
        "        }",
        "        if(!/--drafts/.test(s)){",
        "          p.scripts[k]=p.scripts[k].replace(/jekyll(\\s+serve|\\s+s)/g,'jekyll$1 --drafts');",
        "          changed=true;",
        "        }",
        "        if(!/--future/.test(s)){",
        "          p.scripts[k]=p.scripts[k].replace(/jekyll(\\s+serve|\\s+s)/g,'jekyll$1 --future');",
        "          changed=true;",
        "        }",
        "      }",
        // Hexo
        "      if(/hexo\\s+server/.test(s) || /hexo\\s+s(\\s|$)/.test(s)){",
        "        if(!/--drafts/.test(s) && !/-d(\\s|$)/.test(s)){",
        "          p.scripts[k]=p.scripts[k].replace(/hexo(\\s+server|\\s+s)/g,'hexo$1 --drafts');",
        "          changed=true;",
        "        }",
        "      }",
        // Astro
        "      if(/\\bastro\\s+dev/.test(s)){",
        "        if(!/--buildDrafts/.test(s)){",
        "          p.scripts[k]=p.scripts[k].replace(/\\bastro\\s+dev/g,'astro dev --buildDrafts');",
        "          changed=true;",
        "        }",
        "        if(!/--buildFuture/.test(p.scripts[k])){",
        "          p.scripts[k]=p.scripts[k].replace(/\\bastro\\s+dev/g,'astro dev --buildFuture');",
        "          changed=true;",
        "        }",
        "      }",
        // Next.js
        "      if(/\\bnext\\s+dev/.test(s)){",
        "        if(!/BUILD_DRAFTS/.test(s)){",
        "          p.scripts[k]=p.scripts[k].replace(/\\bnext\\s+dev/g,'BUILD_DRAFTS=true next dev');",
        "          changed=true;",
        "        }",
        "        if(!/BUILD_FUTURE/.test(p.scripts[k])){",
        "          p.scripts[k]=p.scripts[k].replace(/\\bnext\\s+dev/g,'BUILD_FUTURE=true next dev');",
        "          changed=true;",
        "        }",
        "      }",
        "    }",
        "    if(changed){",
        "      fs.writeFileSync('package.json',JSON.stringify(p,null,2));",
        "      console.log('PATCHED');",
        "    }",
        "  }",
        "}catch(e){}",
      ].join(""),
    ],
    signal,
  });
  return (await result.stdout()).trim() === "PATCHED";
}

async function startDevServer(
  session: Session,
  pkgManager: string,
  port: number,
  generator?: string,
  previewUrl?: string,
  signal?: AbortSignal,
) {
  const key = generator?.toLowerCase() ?? "";

  if (
    ["hugo", "hugo_examplesite", "jekyll", "hexo", "nextjs", "astro"].includes(
      key,
    )
  ) {
    await patchPackageScripts(session, signal);
  }

  const isHugo = key === "hugo" || key === "hugo_examplesite";
  const goEnvPrefix = isHugo
    ? "export GOROOT=$PWD/go GOPATH=$PWD/gopath PATH=$PWD/go/bin:$PWD/node_modules/.bin:$PATH && "
    : "";

  let fullCmd = PKG_START[pkgManager].join(" ");
  if (isHugo) {
    if (key === "hugo_examplesite") {
      fullCmd = [
        "THEME_NAME=$(node -e \"const p=require('./package.json');console.log(p.name)\")",
        'PARENT=$(dirname "$PWD")',
        '[ -e "$PARENT/$THEME_NAME" ] || ln -sfn "$PWD" "$PARENT/$THEME_NAME"',
        getRunScriptCommand(pkgManager, "dev:example").join(" "),
      ].join(" && ");
    } else {
      const expectedScript = "dev";
      if (await hasPackageScript(session, expectedScript, signal)) {
        fullCmd = getRunScriptCommand(pkgManager, expectedScript).join(" ");
      } else {
        fullCmd =
          'hugo serve --bind 0.0.0.0 --liveReloadPort 443 --buildDrafts --buildFuture --appendPort=false --baseURL "$SITEPINS_BASE_URL"';
      }
    }
  }

  const isNextjs = key === "nextjs" || key === "next";

  await session.runCommand({
    cmd: "sh",
    args: ["-c", `${goEnvPrefix}${fullCmd} > /tmp/devserver.log 2>&1`],
    env: {
      PORT: String(port),
      HOST: "0.0.0.0",
      SITEPINS_BASE_URL: previewUrl ?? "",
      __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS: ".vercel.run",
      ...(isNextjs && {
        BUILD_DRAFTS: "true",
        BUILD_FUTURE: "true",
      }),
    },
    detached: true,
    signal,
  });
}

/**
 * Downloads and installs Hugo extended binary if not already in PATH.
 */
async function installHugoIfNeeded(
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
  const found = (await check.stdout()).trim();
  if (found.includes("OK")) return false;

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

/**
 * Installs Go to ./go/ in the project directory.
 */
async function installGoIfNeeded(
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

async function isDevServerAlive(
  url: string,
  signal?: AbortSignal,
): Promise<boolean> {
  return await Promise.race([
    fetch(url, { method: "HEAD", signal })
      .then((r) => r.ok || r.status < 500)
      .catch(() => false),
    new Promise<boolean>((res) => setTimeout(() => res(false), 2500)),
  ]);
}

async function pullLatestCommits(
  session: Session,
  repository: string,
  branch: string,
  provider: string,
  token: string | undefined,
  signal?: AbortSignal,
) {
  const authUrl = isGitLabProvider(provider)
    ? `https://oauth2:${token}@gitlab.com/${repository}.git`
    : `https://x-access-token:${token}@github.com/${repository}.git`;
  await session.runCommand({
    cmd: "git",
    args: ["fetch", "--depth", "1", authUrl, branch],
    signal,
  });
  await session.runCommand({
    cmd: "git",
    args: ["reset", "--hard", "FETCH_HEAD"],
    signal,
  });
}

// ── Quick ops handler ──

async function handleQuickOp(
  body: Record<string, any>,
  cookieHeader: string,
  signal: AbortSignal,
): Promise<NextResponse> {
  const {
    repository,
    branch,
    token,
    provider,
    generator,
    forceSync,
    uncommittedFile,
    spProjectId,
  } = body;
  if (!spProjectId) return NextResponse.json({ active: false });

  const auth = getSandboxAuth(body);
  const port =
    FRAMEWORK_PORT[
      (generator ?? "nextjs").toLowerCase().replace(/[^a-z_]/g, "")
    ] ?? 3000;
  const { sandboxName, commitSha: cachedSha } = await getCachedPreview(
    spProjectId,
    cookieHeader,
  );
  if (!sandboxName) return NextResponse.json({ active: false });

  try {
    const sandbox = await Sandbox.get({
      name: sandboxName,
      resume: false,
      ...auth,
      signal,
      fetch: cleanVercelFetch,
    });
    const session = sandbox.currentSession();
    if (session.status !== "running") throw new Error("stopped");

    const previewUrl = session.domain(port);

    if (uncommittedFile) {
      try {
        await writeFileViaShell(
          session,
          uncommittedFile.path,
          uncommittedFile.content,
          signal,
        );
      } catch {
        // Write failed but sandbox is still alive — don't clear preview state.
        // Client retries on next keystroke.
        return NextResponse.json({
          sandboxName,
          previewUrl,
          uncommittedSynced: false,
        });
      }

      const gen = (generator ?? "").toLowerCase();
      let bridgeJustInjected = false;
      if (gen === "nextjs") {
        // Next.js bridge: React component that calls router.refresh() on postMessage.
        // Fast no-op after first install. Returns true if freshly patched — client
        // must do a full reload to activate the bridge before postMessage works.
        bridgeJustInjected = await ensureSitepinsBridge(session, signal);
      }

      // Static site generator/framework migration/updates: patch package.json with liveReload/draft flags, then restart if changed.
      if (
        generator &&
        [
          "hugo",
          "hugo_examplesite",
          "jekyll",
          "hexo",
          "nextjs",
          "astro",
        ].includes(generator.toLowerCase())
      ) {
        const didPatch = await patchPackageScripts(session, signal);
        if (didPatch) {
          const pm = await detectPackageManager(session, signal);
          await session.runCommand({
            cmd: "sh",
            args: ["-c", `fuser -k ${port}/tcp || true`],
            signal,
          });
          await startDevServer(
            session,
            pm,
            port,
            generator,
            previewUrl,
            signal,
          );
          return NextResponse.json({
            sandboxName,
            previewUrl,
            uncommittedSynced: true,
            serverRestarted: true,
          });
        }
      }

      return NextResponse.json({
        sandboxName,
        previewUrl,
        uncommittedSynced: true,
        ...(bridgeJustInjected && { bridgeJustInjected: true }),
      });
    }

    if (forceSync) {
      const latestSha = await getLatestCommitSha(
        provider,
        repository,
        branch,
        token,
        signal,
      );
      if (latestSha && cachedSha !== latestSha) {
        await pullLatestCommits(
          session,
          repository,
          branch,
          provider,
          token,
          signal,
        );
        const pm = await detectPackageManager(session, signal);
        await session.runCommand({
          cmd: PKG_INSTALL[pm][0],
          args: PKG_INSTALL[pm].slice(1),
          signal,
        });
        await session.runCommand({
          cmd: "sh",
          args: ["-c", `fuser -k ${port}/tcp || true`],
          signal,
        });
        await startDevServer(session, pm, port, generator, previewUrl, signal);
        await waitForServer(previewUrl, 15_000, signal);
        await syncSandboxPreviewState(
          spProjectId,
          {
            sandbox_name: sandboxName,
            preview_url: previewUrl,
            commit_sha: latestSha,
          },
          cookieHeader,
        );
      }
    }

    return NextResponse.json({ sandboxName, previewUrl });
  } catch {
    return NextResponse.json({ active: false });
  }
}

// ── Streaming sandbox creation ────────────────────────────────────────────────

const enc = new TextEncoder();

async function* streamCreate(
  body: Record<string, any>,
  cookieHeader: string,
  signal: AbortSignal,
): AsyncGenerator<object> {
  const {
    repository,
    branch,
    token,
    provider,
    generator,
    uncommittedFile,
    spProjectId,
  } = body;
  if (!spProjectId) throw new Error("spProjectId is required");

  const auth = getSandboxAuth(body);
  const port =
    FRAMEWORK_PORT[
      (generator ?? "nextjs").toLowerCase().replace(/[^a-z_]/g, "")
    ] ?? 3000;
  const isHugo =
    generator && ["hugo", "hugo_examplesite"].includes(generator.toLowerCase());

  yield { step: "Checking session" };
  const latestSha = await getLatestCommitSha(
    provider,
    repository,
    branch,
    token,
    signal,
  );
  const { sandboxName: cachedName, commitSha: cachedSha } =
    await getCachedPreview(spProjectId, cookieHeader);

  // ── 1. Try to reuse existing sandbox ──
  if (cachedName) {
    try {
      const existing = await Sandbox.get({
        name: cachedName,
        resume: false,
        ...auth,
        signal,
        fetch: cleanVercelFetch,
      });
      const session = existing.currentSession();
      const previewUrl = session.domain(port);

      if (session.status === "running") {
        const isUpToDate = !latestSha || cachedSha === latestSha;
        if (isUpToDate && (await isDevServerAlive(previewUrl, signal))) {
          await syncSandboxPreviewState(
            spProjectId,
            {
              sandbox_name: cachedName,
              preview_url: previewUrl,
              commit_sha: latestSha ?? cachedSha,
            },
            cookieHeader,
          );
          if ((generator ?? "").toLowerCase() === "nextjs") {
            await ensureSitepinsBridge(session, signal);
          }
          yield {
            done: true,
            previewUrl,
            sandboxName: cachedName,
            commitSha: latestSha,
          };
          return;
        }

        // Sandbox is up but code is stale OR dev server died — pull + restart
        if (latestSha && cachedSha !== latestSha) {
          yield { step: "Pulling commits" };
          await pullLatestCommits(
            session,
            repository,
            branch,
            provider,
            token,
            signal,
          );
          yield { step: "Installing dependencies" };
          await installDeps(
            session,
            await detectPackageManager(session, signal),
            signal,
          );
        }
        if ((generator ?? "").toLowerCase() === "nextjs") {
          await ensureSitepinsBridge(session, signal);
        }
        yield { step: "Starting server" };
        await session.runCommand({
          cmd: "sh",
          args: ["-c", `fuser -k ${port}/tcp || true`],
          signal,
        });
        await startDevServer(
          session,
          await detectPackageManager(session, signal),
          port,
          generator,
          previewUrl,
          signal,
        );
        const ready = await waitForServer(
          previewUrl,
          SERVER_READY_TIMEOUT_MS,
          signal,
        );
        if (!ready) throw new Error("Dev server did not become ready in time.");

        await syncSandboxPreviewState(
          spProjectId,
          {
            sandbox_name: cachedName,
            preview_url: previewUrl,
            commit_sha: latestSha ?? cachedSha,
          },
          cookieHeader,
        );
        yield {
          done: true,
          previewUrl,
          sandboxName: cachedName,
          commitSha: latestSha,
        };
        return;
      }

      // Session stopped — resume the persistent sandbox (no re-clone / re-install needed)
      yield { step: "Resuming sandbox" };
      const resumed = await Sandbox.get({
        name: cachedName,
        resume: true,
        ...auth,
        signal,
        fetch: cleanVercelFetch,
      });
      const resumedSession = resumed.currentSession();
      const resumedPreviewUrl = resumedSession.domain(port);

      // Pull latest commits if the code is stale
      if (latestSha && cachedSha !== latestSha) {
        yield { step: "Pulling commits" };
        await pullLatestCommits(
          resumedSession,
          repository,
          branch,
          provider,
          token,
          signal,
        );
        yield { step: "Installing dependencies" };
        await installDeps(
          resumedSession,
          await detectPackageManager(resumedSession, signal),
          signal,
        );
      }

      if ((generator ?? "").toLowerCase() === "nextjs") {
        await ensureSitepinsBridge(resumedSession, signal);
      }
      yield { step: "Starting server" };
      await resumedSession.runCommand({
        cmd: "sh",
        args: ["-c", `fuser -k ${port}/tcp || true`],
        signal,
      });
      await startDevServer(
        resumedSession,
        await detectPackageManager(resumedSession, signal),
        port,
        generator,
        resumedPreviewUrl,
        signal,
      );
      const resumeReady = await waitForServer(
        resumedPreviewUrl,
        SERVER_READY_TIMEOUT_MS,
        signal,
      );
      if (!resumeReady)
        throw new Error("Dev server did not become ready in time.");

      await syncSandboxPreviewState(
        spProjectId,
        {
          sandbox_name: cachedName,
          preview_url: resumedPreviewUrl,
          commit_sha: latestSha ?? cachedSha,
        },
        cookieHeader,
      );
      yield {
        done: true,
        previewUrl: resumedPreviewUrl,
        sandboxName: cachedName,
        commitSha: latestSha,
      };
      return;
    } catch {
      // Sandbox gone or unreachable — fall through to cold-start
    }
  }

  // ── 2. Cold start: clone → install → start ──
  yield { step: "Cloning repository" };
  const repoUrl = isGitLabProvider(provider)
    ? `https://gitlab.com/${repository}.git`
    : `https://github.com/${repository}.git`;

  const gitSource = token
    ? {
        type: "git" as const,
        url: repoUrl,
        revision: branch,
        depth: 1,
        username: isGitLabProvider(provider) ? "oauth2" : "x-access-token",
        password: token,
      }
    : { type: "git" as const, url: repoUrl, revision: branch, depth: 1 };

  const sandbox = await Sandbox.create({
    source: gitSource,
    ports: [port],
    timeout: COLD_START_TIMEOUT_MS,
    signal,
    fetch: cleanVercelFetch,
    ...auth,
  });
  const sandboxName = sandbox.name;
  const session = sandbox.currentSession();
  const previewUrl = session.domain(port);

  yield { step: "Installing dependencies" };
  const pm = await detectPackageManager(session, signal);
  await installDeps(session, pm, signal);

  if (isHugo) {
    yield { step: "Installing Go" };
    await installGoIfNeeded(session, signal);
    yield { step: "Installing Hugo" };
    await installHugoIfNeeded(session, signal);
  }

  if (uncommittedFile) {
    await writeFileViaShell(
      session,
      uncommittedFile.path,
      uncommittedFile.content,
      signal,
    );
  }

  if ((generator ?? "").toLowerCase() === "nextjs") {
    await ensureSitepinsBridge(session, signal);
  }

  yield { step: "Starting server" };
  await startDevServer(session, pm, port, generator, previewUrl, signal);

  yield { step: "Waiting for server" };
  const ready = await waitForServer(
    previewUrl,
    SERVER_READY_TIMEOUT_MS,
    signal,
  );

  if (!ready) {
    await session.stop();
    throw new Error(
      "Dev server did not become ready in time. Check your project for build errors.",
    );
  }

  await syncSandboxPreviewState(
    spProjectId,
    {
      sandbox_name: sandboxName,
      preview_url: previewUrl,
      commit_sha: latestSha ?? undefined,
    },
    cookieHeader,
  );

  yield { done: true, previewUrl, sandboxName, commitSha: latestSha };
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await getAuth(req);
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cookieHeader = req.headers.get("cookie") ?? "";
  const body = await req.json();

  if (!body.repository || !body.branch) {
    return NextResponse.json(
      { error: "repository and branch are required" },
      { status: 400 },
    );
  }
  if (!body.spProjectId) {
    return NextResponse.json(
      { error: "spProjectId is required" },
      { status: 400 },
    );
  }

  if (!body.vercelToken || !body.vercelProjectId) {
    return NextResponse.json(
      {
        error: "Vercel credentials not configured.",
        code: "VERCEL_CREDENTIALS_MISSING",
      },
      { status: 400 },
    );
  }

  // Quick background ops (typing sync) → JSON
  // Only short-circuit when onlyIfActive is explicitly set.
  // uncommittedFile alone must NOT gate here — it's also used in the SSE
  // cold-start path (streamCreate writes the file after cloning).
  if (body.onlyIfActive) {
    return handleQuickOp(body, cookieHeader, req.signal);
  }

  // New sandbox creation → SSE stream
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const msg of streamCreate(body, cookieHeader, req.signal)) {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(msg)}\n\n`));
        }
      } catch (e: any) {
        // Surface the real Vercel API error body — the SDK wraps the response
        // payload in `.json` / `.text` on its APIError. Without this, all
        // failures collapse to a generic "Status code 403 is not ok".
        const apiJson = e?.json;
        const detail =
          apiJson?.error?.message ||
          (typeof apiJson?.error === "string" ? apiJson.error : null) ||
          apiJson?.message ||
          e?.text ||
          e?.message ||
          "Unknown error";
        const code = apiJson?.error?.code || apiJson?.code;
        console.error("[sandbox/create] error:", {
          message: e?.message,
          code,
          json: apiJson,
          text: e?.text,
        });
        controller.enqueue(
          enc.encode(`data: ${JSON.stringify({ error: detail, code })}\n\n`),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
