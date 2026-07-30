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

export async function waitForServer(
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

export async function isDevServerAlive(
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
