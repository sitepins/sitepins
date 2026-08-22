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

export type PollEvent = { ready: boolean; attempt: number; status?: number };

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
  const probeTargets = [url, `${baseUrl}/favicon.ico`];

  while (Date.now() < deadline) {
    if (signal?.aborted) return false;
    attempts++;

    // 1. Direct container TCP socket check (instant in 1ms without triggering heavy SSR page compilation)
    if (session && port) {
      try {
        const probeRes = await session.runCommand({
          cmd: "node",
          args: [
            "-e",
            `const s=require('net').connect(${port},'127.0.0.1',()=>{console.log('OPEN');s.destroy();process.exit(0)});s.on('error',()=>process.exit(1));`,
          ],
          signal,
        });
        const out = (await probeRes.stdout()).trim();
        if (out === "OPEN") {
          yield { ready: true, attempt: attempts, status: 200 };
          return true;
        }
      } catch {
        /* continue to external probe */
      }
    }

    // 2. Public preview URL probe
    for (const target of probeTargets) {
      if (signal?.aborted) return false;
      try {
        const abortCtrl = new AbortController();
        const timer = setTimeout(() => abortCtrl.abort(), 2000);
        const onAbort = () => abortCtrl.abort();
        signal?.addEventListener("abort", onAbort, { once: true });

        try {
          const r = await fetch(target, {
            method: "GET",
            signal: abortCtrl.signal,
            headers: { "User-Agent": "Sitepins-Probe" },
          });

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

    yield {
      ready: false,
      attempt: attempts,
      ...(lastStatus > 0 && { status: lastStatus }),
    };

    await new Promise((r) => setTimeout(r, 1000));
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
): Promise<boolean> {
  const baseUrl = url.replace(/\/$/, "");
  const probeTargets = [url, `${baseUrl}/favicon.ico`];

  for (const target of probeTargets) {
    const abortCtrl = new AbortController();
    const timer = setTimeout(() => abortCtrl.abort(), 2500);
    const onAbort = () => abortCtrl.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      const r = await fetch(target, {
        method: "GET",
        signal: abortCtrl.signal,
        headers: { "User-Agent": "Sitepins-Probe" },
      });
      if (r.ok || r.status < 500) return true;
    } catch {
      /* continue to next target */
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  }
  return false;
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
