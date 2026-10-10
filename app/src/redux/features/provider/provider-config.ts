import {
  isGitHubProvider,
  isGitLabProvider,
} from "@/lib/utils/provider-checker";
import { TConfig } from "@/types";
import { TDelegatedToken } from "./delegated-token";
import { TProvider } from "./type";

type TProviderConfig = Pick<
  TConfig,
  | "provider"
  | "token"
  | "currentLoginUserToken"
  | "refreshToken"
  | "accessTokenExpiresAt"
  | "refreshTokenExpiresAt"
  | "lastRefreshedAt"
  | "delegatedProjectId"
>;

export type TProviderSelection = {
  config: TProviderConfig;
  /** True when the caller isn't the connection's owner and needs a project token. */
  delegated: boolean;
};

export function selectProviderConfig({
  providers,
  loginUserId,
  targetUserId,
  targetProvider,
}: {
  providers: TProvider[];
  loginUserId?: string;
  targetUserId?: string;
  targetProvider?: string;
}): TProviderSelection | null {
  const github = providers.filter((p) => isGitHubProvider(p.provider));
  const gitlab = providers.filter((p) => isGitLabProvider(p.provider));

  const useGitlab = isGitLabProvider(targetProvider)
    ? gitlab.length > 0
    : github.length === 0 && gitlab.length > 0;
  if (!useGitlab && github.length === 0) return null;

  const rows = useGitlab ? gitlab : github;
  const loginRow = rows.find((p) => p.user_id === loginUserId);
  const delegated = Boolean(targetUserId) && targetUserId !== loginUserId;

  if (delegated) {
    return {
      delegated,
      config: {
        provider: useGitlab ? "Gitlab" : "Github",
        currentLoginUserToken: loginRow?.accessToken ?? "",
        token: "",
        refreshToken: "",
        accessTokenExpiresAt: 0,
        refreshTokenExpiresAt: 0,
        lastRefreshedAt: 0,
        delegatedProjectId: "",
      },
    };
  }

  const selected = rows.find((p) => p.user_id === targetUserId);
  return {
    delegated,
    config: {
      provider: useGitlab ? "Gitlab" : "Github",
      currentLoginUserToken: loginRow?.accessToken ?? "",
      token: selected?.accessToken ?? "",
      refreshToken: selected?.refreshToken || "",
      accessTokenExpiresAt: selected?.accessTokenExpiresAt || 0,
      refreshTokenExpiresAt: selected?.refreshTokenExpiresAt || 0,
      lastRefreshedAt: selected?.lastRefreshedAt || 0,
      delegatedProjectId: "",
    },
  };
}

export const withDelegatedToken = (
  config: TProviderConfig,
  projectId: string,
  delegated: TDelegatedToken | null,
): TProviderConfig =>
  delegated
    ? {
        ...config,
        provider: delegated.provider,
        token: delegated.token,
        accessTokenExpiresAt: delegated.expires_at,
        lastRefreshedAt: Date.now(),
        delegatedProjectId: projectId,
      }
    : config;
