import { logger } from "@/lib/logger";
import { TGitProvider } from "@/lib/utils/provider-checker";
import { updateConfig } from "../config/slice";

export type TDelegatedToken = {
  provider: TGitProvider;
  token: string;
  expires_at: number;
};

type TConfigState = {
  config: {
    token: string;
    delegatedProjectId: string;
    accessTokenExpiresAt: number | Date | string;
  };
};

const REFRESH_MARGIN_MS = 5 * 60 * 1000;

export const isTokenExpiring = (value: number | Date | string | undefined) => {
  const expiresAt =
    typeof value === "number" ? value : value ? new Date(value).getTime() : 0;
  return expiresAt > 0 && Date.now() >= expiresAt - REFRESH_MARGIN_MS;
};

const inflight = new Map<string, Promise<TDelegatedToken | null>>();

/** Project-scoped token for a member who doesn't own the project's git connection. */
export const fetchDelegatedToken = (
  projectId: string,
): Promise<TDelegatedToken | null> => {
  const pending = inflight.get(projectId);
  if (pending) return pending;

  const request = fetch("/api/auth/project-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId }),
  })
    .then(async (res) => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(data?.error || "Project token request failed");
      return data as TDelegatedToken;
    })
    .catch((error) => {
      logger.error("Project token request failed:", error);
      return null;
    })
    .finally(() => inflight.delete(projectId));

  inflight.set(projectId, request);
  return request;
};

/** Renews a delegated token near expiry; returns the token to use for repo calls. */
export const refreshDelegatedToken = async (
  getState: () => unknown,
  dispatch: (action: ReturnType<typeof updateConfig>) => unknown,
): Promise<string> => {
  const { config } = getState() as TConfigState;
  const projectId = config.delegatedProjectId;
  if (!projectId || !isTokenExpiring(config.accessTokenExpiresAt)) {
    return config.token;
  }

  const fresh = await fetchDelegatedToken(projectId);
  const current = (getState() as TConfigState).config;
  // The user may have left the project while the request was in flight.
  if (!fresh || current.delegatedProjectId !== projectId) return current.token;

  dispatch(
    updateConfig({
      token: fresh.token,
      accessTokenExpiresAt: fresh.expires_at,
      lastRefreshedAt: Date.now(),
    }),
  );
  return fresh.token;
};
