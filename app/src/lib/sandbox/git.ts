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

export async function pullLatestCommits(
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
    // `--` stops option parsing: git keeps reading flags after positional
    // args, so a branch named `--upload-pack=…` would otherwise run a command.
    args: ["fetch", "--depth", "1", "--", authUrl, branch],
    signal,
  });
  await session.runCommand({
    cmd: "git",
    args: ["reset", "--hard", "FETCH_HEAD"],
    signal,
  });
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
