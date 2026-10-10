import { API_URL, GITHUB_API_VERSION } from "@/lib/constant";
import { logger } from "@/lib/logger";
import { errorStatus } from "@/lib/utils/error";
import { TGitProvider } from "@/lib/utils/provider-checker";
import { App, Octokit } from "octokit";
import { narrowPermissions } from "./installation-permissions";
import {
  refreshGitHubUserToken,
  refreshGitLabToken,
  TRefreshedTokens,
} from "./oauth-refresh";

/** Server-only: the grant carries the project owner's tokens. */
export type TProjectGrant = {
  provider: TGitProvider;
  repository: string;
  owner_user_id: string;
  access_token: string;
  access_token_expires_at?: number;
  refresh_token?: string;
};

/** The only credential a project member's browser receives. */
export type TProjectToken = {
  provider: TGitProvider;
  token: string;
  expires_at: number;
};

export class ProjectTokenError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const REFRESH_MARGIN_MS = 5 * 60 * 1000;

const internalHeaders = () => {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) {
    throw new ProjectTokenError("INTERNAL_API_SECRET is not set", 500);
  }
  return { "Content-Type": "application/json", "x-internal-secret": secret };
};

export async function fetchProjectGrant(
  projectId: string,
  userId: string,
): Promise<TProjectGrant> {
  const res = await fetch(
    `${API_URL}/provider/project-grant/${encodeURIComponent(projectId)}?user_id=${encodeURIComponent(userId)}`,
    { headers: internalHeaders(), cache: "no-store" },
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const status = [400, 403, 404].includes(res.status) ? res.status : 502;
    throw new ProjectTokenError(
      body?.message || "Project access denied",
      status,
    );
  }
  return body.result as TProjectGrant;
}

async function persistRotation(
  provider: TGitProvider,
  oldRefreshToken: string,
  fresh: TRefreshedTokens,
) {
  const res = await fetch(`${API_URL}/provider/rotate`, {
    method: "POST",
    headers: internalHeaders(),
    body: JSON.stringify({
      provider,
      old_refresh_token: oldRefreshToken,
      ...fresh,
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`rotate failed with ${res.status}`);
}

const isExpiring = (expiresAt?: number) =>
  Boolean(expiresAt) && Date.now() >= (expiresAt as number) - REFRESH_MARGIN_MS;

// Refresh tokens are single-use, so concurrent members must share one exchange.
const inflightRefresh = new Map<string, Promise<TRefreshedTokens>>();

async function ownerAccessToken(
  grant: TProjectGrant,
  reloadGrant: () => Promise<TProjectGrant>,
  origin: string,
): Promise<{ token: string; expires_at: number }> {
  if (!grant.refresh_token) {
    // Not refreshable; a stale expiry would make the client re-request forever.
    return { token: grant.access_token, expires_at: 0 };
  }
  if (!isExpiring(grant.access_token_expires_at)) {
    return {
      token: grant.access_token,
      expires_at: grant.access_token_expires_at ?? 0,
    };
  }

  const key = `${grant.provider}:${grant.owner_user_id}`;
  let pending = inflightRefresh.get(key);
  if (!pending) {
    const refreshToken = grant.refresh_token;
    pending = (async () => {
      const fresh =
        grant.provider === "Gitlab"
          ? await refreshGitLabToken(refreshToken, origin)
          : await refreshGitHubUserToken(refreshToken);
      try {
        await persistRotation(grant.provider, refreshToken, fresh);
      } catch (error) {
        logger.error("Failed to persist rotated owner tokens:", error);
      }
      return fresh;
    })().finally(() => inflightRefresh.delete(key));
    inflightRefresh.set(key, pending);
  }

  try {
    const fresh = await pending;
    return {
      token: fresh.access_token,
      expires_at: fresh.access_token_expires_at,
    };
  } catch (error) {
    // Another server instance (or the owner's browser) may have rotated first.
    const latest = await reloadGrant();
    if (!isExpiring(latest.access_token_expires_at)) {
      return {
        token: latest.access_token,
        expires_at: latest.access_token_expires_at ?? 0,
      };
    }
    logger.error("Owner token refresh failed:", error);
    throw new ProjectTokenError(
      "The project owner's git connection has expired. Ask them to reconnect.",
      409,
    );
  }
}

export async function mintRepoInstallationToken(
  repository: string,
  ownerToken: string,
): Promise<{ token: string; expires_at: number }> {
  const [owner, repo] = repository.split("/");
  if (!owner || !repo) {
    throw new ProjectTokenError("Invalid project repository", 400);
  }

  // Proves the project creator can push here, so an org admin who repoints the
  // project at another repo where the app is installed gains nothing.
  const ownerOctokit = new Octokit({
    auth: ownerToken,
    request: { headers: { "X-GitHub-Api-Version": GITHUB_API_VERSION } },
  });
  let repoData;
  try {
    ({ data: repoData } = await ownerOctokit.request(
      "GET /repos/{owner}/{repo}",
      { owner, repo },
    ));
  } catch (error) {
    if ([401, 403, 404].includes(errorStatus(error) ?? 0)) {
      throw new ProjectTokenError(
        "The project owner's GitHub account cannot access this repository",
        403,
      );
    }
    throw error;
  }
  if (!repoData.permissions?.push) {
    throw new ProjectTokenError(
      "The project owner's GitHub account cannot push to this repository",
      403,
    );
  }

  const app = new App({
    appId: process.env.GITHUB_APP_ID!,
    privateKey: process.env.GITHUB_APP_PRIVATE_KEY!,
  });
  const { data: installation } = await app.octokit.request(
    "GET /repos/{owner}/{repo}/installation",
    { owner, repo },
  );
  const { data: minted } = await app.octokit.request(
    "POST /app/installations/{installation_id}/access_tokens",
    {
      installation_id: installation.id,
      repository_ids: [Number(repoData.id)],
      permissions: narrowPermissions(installation.permissions),
    },
  );

  return {
    token: minted.token,
    expires_at: new Date(minted.expires_at).getTime(),
  };
}

export async function issueProjectToken(
  projectId: string,
  userId: string,
  origin: string,
): Promise<TProjectToken> {
  const reloadGrant = () => fetchProjectGrant(projectId, userId);
  const grant = await reloadGrant();
  const owner = await ownerAccessToken(grant, reloadGrant, origin);

  if (grant.provider === "Gitlab") {
    return {
      provider: "Gitlab",
      token: owner.token,
      expires_at: owner.expires_at,
    };
  }

  const minted = await mintRepoInstallationToken(grant.repository, owner.token);
  return { provider: "Github", ...minted };
}
