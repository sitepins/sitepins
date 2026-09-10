import { logger } from "@/lib/logger";
import { Session } from "@vercel/sandbox";

export const SERVER_READY_TIMEOUT_MS = 180_000;
export const COLD_START_TIMEOUT_MS = 20 * 60 * 1000;

export const PKG_START: Record<string, string[]> = {
  pnpm: ["pnpm", "run", "dev"],
  yarn: ["yarn", "dev"],
  bun: ["bun", "run", "dev"],
  npm: ["npm", "run", "dev"],
};

export const PKG_INSTALL: Record<string, string[]> = {
  pnpm: ["pnpm", "install"],
  yarn: ["yarn", "install"],
  bun: ["bun", "install"],
  npm: ["npm", "install"],
};

/** Writes a file in the sandbox using a shell pipeline (base64 → file). */
export async function writeFileViaShell(
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

export async function detectPackageManager(
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

export function getRunScriptCommand(
  pkgManager: string,
  script: string,
): string[] {
  if (pkgManager === "pnpm") return ["pnpm", "run", script];
  if (pkgManager === "yarn") return ["yarn", script];
  if (pkgManager === "bun") return ["bun", "run", script];
  return ["npm", "run", script];
}

export async function hasPackageScript(
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

export async function installDeps(
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
    logger.warn(`[sandbox] ${active} install failed, falling back to npm`);
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

export async function killPort(
  session: Session,
  port: number,
  signal?: AbortSignal,
): Promise<void> {
  await session.runCommand({
    cmd: "sh",
    args: ["-c", `fuser -k ${port}/tcp || true`],
    signal,
  });
}

export type PollEvent = {
  ready: boolean;
  attempt: number;
  status?: number;
  log?: string;
};

export async function* waitForServerStream(
  url: string,
  timeoutMs: number,
  signal?: AbortSignal,
  session?: Session,
  port?: number,
): AsyncGenerator<PollEvent, boolean> {
  const deadline = Date.now() + timeoutMs;
  let attempts = 0;
  let lastStatus = 0;
  const baseUrl = url.replace(/\/$/, "");
  const probeTargets = [
    url,
    `${baseUrl}/__vite_ping`,
    `${baseUrl}/favicon.ico`,
  ];

  let hasPrewarmed = false;

  while (Date.now() < deadline) {
    if (signal?.aborted) return false;
    attempts++;
    let currentLog = "";

    // 1. Direct container TCP socket check if session & port are given
    let localSocketOpen = false;
    if (session && port) {
      try {
        const probeRes = await session.runCommand({
          cmd: "node",
          args: [
            "-e",
            `const s=require('net').connect(${port},'127.0.0.1',()=>{console.log('OPEN');s.destroy();process.exit(0)});s.on('error',()=>process.exit(1));setTimeout(()=>{s.destroy();process.exit(1);},1500);`,
          ],
          signal,
        });
        const out = (await probeRes.stdout()).trim();
        if (out === "OPEN") {
          localSocketOpen = true;
          // Pre-warm the dev server root route internally with 0ms network latency
          // so initial SSR compilation completes before user's browser opens the URL
          if (!hasPrewarmed) {
            hasPrewarmed = true;
            session
              .runCommand({
                cmd: "sh",
                args: [
                  "-c",
                  `curl -s -m 5 http://127.0.0.1:${port}/ > /dev/null 2>&1 &`,
                ],
              })
              .catch(() => {});
          }
        }
      } catch {
        /* container socket check error */
      }

      // Early crash detection: if after 3 attempts (~2.5s) socket still isn't open,
      // inspect devserver.log for fatal exit errors so we don't hang waiting
      if (!localSocketOpen && attempts >= 3 && attempts % 2 === 1) {
        try {
          const logCheck = await session.runCommand({
            cmd: "sh",
            args: ["-c", `tail -n 100 /tmp/devserver.log 2>/dev/null || true`],
            signal,
          });
          currentLog = (await logCheck.stdout()).trim();
          if (
            currentLog &&
            /(?:npm ERR!|ELIFECYCLE|SyntaxError:|Cannot find module|address already in use|EADDRINUSE|command not found|sh:\s*\d*:\s*[^:]+:\s*not found|panic:\s*runtime error|FATAL:)/i.test(
              currentLog,
            )
          ) {
            throw new Error(`Dev server exited with an error:\n${currentLog}`);
          }
        } catch (err) {
          if (
            err instanceof Error &&
            err.message.includes("Dev server exited")
          ) {
            throw err;
          }
        }
      }
    }

    // 2. Public preview URL probe:
    // Run when container socket is confirmed open, or if session/port omitted, or every 3 attempts as fallback
    if (localSocketOpen || !session || !port || attempts % 3 === 0) {
      for (const target of probeTargets) {
        if (signal?.aborted) return false;
        try {
          const abortCtrl = new AbortController();
          const timer = setTimeout(() => abortCtrl.abort(), 8000);
          const onAbort = () => abortCtrl.abort();
          signal?.addEventListener("abort", onAbort, { once: true });

          try {
            const r = await fetch(target, {
              method: "HEAD",
              signal: abortCtrl.signal,
              headers: { "User-Agent": "Sitepins-Probe" },
            });

            const vercelErr = r.headers.get("x-vercel-error");
            if (r.status === 502 || vercelErr === "SANDBOX_NOT_LISTENING") {
              lastStatus = 502;
              break;
            }

            if (r.ok || r.status < 500) {
              yield { ready: true, attempt: attempts, status: r.status };
              return true;
            }
            lastStatus = r.status;
          } finally {
            clearTimeout(timer);
            signal?.removeEventListener("abort", onAbort);
          }
        } catch {
          lastStatus = 0;
        }
      }
    }

    yield {
      ready: false,
      attempt: attempts,
      ...(lastStatus > 0 && { status: lastStatus }),
      ...(currentLog && { log: currentLog }),
    };

    await new Promise((r) => setTimeout(r, localSocketOpen ? 400 : 700));
  }

  return false;
}

export async function waitForServer(
  url: string,
  timeoutMs: number,
  signal?: AbortSignal,
  session?: Session,
  port?: number,
): Promise<boolean> {
  const stream = waitForServerStream(url, timeoutMs, signal, session, port);
  for await (const evt of stream) {
    if (evt.ready) return true;
  }
  return false;
}

export async function isDevServerAlive(
  url: string,
  signal?: AbortSignal,
  session?: Session,
  port?: number,
): Promise<boolean> {
  // 1. Direct container TCP socket check if session & port are given
  if (session && port) {
    try {
      const probeRes = await session.runCommand({
        cmd: "node",
        args: [
          "-e",
          `const s=require('net').connect(${port},'127.0.0.1',()=>{console.log('OPEN');s.destroy();process.exit(0)});s.on('error',()=>process.exit(1));setTimeout(()=>{s.destroy();process.exit(1);},1500);`,
        ],
        signal,
      });
      const out = (await probeRes.stdout()).trim();
      if (out === "OPEN") {
        // Dev server is running and bound to the port. Verify public URL isn't returning an explicit 502 SANDBOX_NOT_LISTENING.
        // If public fetch times out because the server is busy compiling pages or processing images,
        // do NOT treat it as dead — the process is active and working.
        try {
          const abortCtrl = new AbortController();
          const timer = setTimeout(() => abortCtrl.abort(), 2500);
          const r = await fetch(url, {
            method: "HEAD",
            signal: abortCtrl.signal,
            headers: { "User-Agent": "Sitepins-Probe" },
          });
          clearTimeout(timer);
          const vercelErr = r.headers.get("x-vercel-error");
          if (r.status === 502 && vercelErr === "SANDBOX_NOT_LISTENING") {
            return false;
          }
          return true;
        } catch {
          // Timed out or transient network issue while server is busy.
          // Since container TCP socket is verified OPEN, dev server is alive.
          return true;
        }
      }
      return false;
    } catch {
      /* continue to external probe */
    }
  }

  // 2. External HTTP probe fallback (HEAD first, then GET)
  const baseUrl = url.replace(/\/$/, "");
  const probeTargets = [url, `${baseUrl}/favicon.ico`];

  for (const target of probeTargets) {
    const abortCtrl = new AbortController();
    const timer = setTimeout(() => abortCtrl.abort(), 5000);
    const onAbort = () => abortCtrl.abort();
    signal?.addEventListener("abort", onAbort, { once: true });

    try {
      const r = await fetch(target, {
        method: "HEAD",
        signal: abortCtrl.signal,
        headers: { "User-Agent": "Sitepins-Probe" },
      });
      const vercelErr = r.headers.get("x-vercel-error");
      if (r.status === 502 || vercelErr === "SANDBOX_NOT_LISTENING") {
        return false;
      }
      if (r.ok || r.status < 500) {
        return true;
      }
    } catch {
      /* fallback to GET */
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  }

  const getAbort = new AbortController();
  const getTimer = setTimeout(() => getAbort.abort(), 5000);
  const onGetAbort = () => getAbort.abort();
  signal?.addEventListener("abort", onGetAbort, { once: true });

  try {
    const r = await fetch(url, {
      method: "GET",
      signal: getAbort.signal,
      headers: { "User-Agent": "Sitepins-Probe" },
    });
    const vercelErr = r.headers.get("x-vercel-error");
    if (r.status === 502 || vercelErr === "SANDBOX_NOT_LISTENING") {
      return false;
    }
    return r.ok || r.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(getTimer);
    signal?.removeEventListener("abort", onGetAbort);
  }
}

/** Reads the tail of the dev-server log from inside the sandbox. */
export async function readDevServerLog(
  session: Session,
  lines = 80,
  signal?: AbortSignal,
): Promise<string> {
  try {
    const result = await session.runCommand({
      cmd: "sh",
      args: [
        "-c",
        `tail -n ${lines} /tmp/devserver.log 2>/dev/null || echo '[no log found]'`,
      ],
      signal,
    });
    return (await result.stdout()).trim();
  } catch {
    return "[failed to read devserver.log]";
  }
}
