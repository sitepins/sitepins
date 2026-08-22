import { logger } from "@/lib/logger";
import { isGitLabProvider } from "@/lib/utils/provider-checker";
import { Session } from "@vercel/sandbox";

export async function getLatestCommitSha(
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
    logger.error("[sandbox] getLatestCommitSha:", e);
  }
  return null;
}

export function getGitAuthUrl(
  provider: string,
  repository: string,
  token?: string,
): string {
  if (isGitLabProvider(provider)) {
    return token
      ? `https://oauth2:${token}@gitlab.com/${repository}.git`
      : `https://gitlab.com/${repository}.git`;
  }
  return token
    ? `https://x-access-token:${token}@github.com/${repository}.git`
    : `https://github.com/${repository}.git`;
}

export async function cloneRepository(
  session: Session,
  repository: string,
  branch: string,
  provider: string,
  token: string | undefined,
  signal?: AbortSignal,
) {
  const authUrl = getGitAuthUrl(provider, repository, token);
  await session.runCommand({ cmd: "git", args: ["init"], signal });
  const fetchRes = await session.runCommand({
    cmd: "git",
    args: ["fetch", "--depth", "1", "--", authUrl, branch],
    signal,
  });
  if (fetchRes.exitCode !== 0) {
    const stderr = await fetchRes.stderr();
    throw new Error(
      `Failed to clone repository (${fetchRes.exitCode}): ${stderr.slice(0, 300)}`,
    );
  }
  const checkoutRes = await session.runCommand({
    cmd: "git",
    args: ["checkout", "-f", "FETCH_HEAD"],
    signal,
  });
  if (checkoutRes.exitCode !== 0) {
    const stderr = await checkoutRes.stderr();
    throw new Error(
      `Failed to checkout repository branch (${checkoutRes.exitCode}): ${stderr.slice(0, 300)}`,
    );
  }
}

export async function pullLatestCommits(
  session: Session,
  repository: string,
  branch: string,
  provider: string,
  token: string | undefined,
  signal?: AbortSignal,
) {
  const authUrl = getGitAuthUrl(provider, repository, token);
  const fetchRes = await session.runCommand({
    cmd: "git",
    // `--` stops option parsing: git keeps reading flags after positional
    // args, so a branch named `--upload-pack=…` would otherwise run a command.
    args: ["fetch", "--depth", "1", "--", authUrl, branch],
    signal,
  });
  if (fetchRes.exitCode !== 0) {
    const stderr = await fetchRes.stderr();
    throw new Error(
      `Failed to pull latest commits (${fetchRes.exitCode}): ${stderr.slice(0, 300)}`,
    );
  }
  const resetRes = await session.runCommand({
    cmd: "git",
    args: ["reset", "--hard", "FETCH_HEAD"],
    signal,
  });
  if (resetRes.exitCode !== 0) {
    const stderr = await resetRes.stderr();
    throw new Error(
      `Failed to reset repository to latest commit (${resetRes.exitCode}): ${stderr.slice(0, 300)}`,
    );
  }
}

export function gitCloneSource(
  provider: string,
  repository: string,
  branch: string,
  token?: string,
) {
  const url = isGitLabProvider(provider)
    ? `https://gitlab.com/${repository}.git`
    : `https://github.com/${repository}.git`;

  return token
    ? {
        type: "git" as const,
        url,
        revision: branch,
        depth: 1,
        username: isGitLabProvider(provider) ? "oauth2" : "x-access-token",
        password: token,
      }
    : { type: "git" as const, url, revision: branch, depth: 1 };
}
