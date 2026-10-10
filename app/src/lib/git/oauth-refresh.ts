import { App } from "octokit";

export type TRefreshedTokens = {
  access_token: string;
  refresh_token: string;
  access_token_expires_at: number;
  refresh_token_expires_at?: number;
};

// GitHub returns these for expiring-token apps; octokit's types omit them.
type TExpiringTokenFields = {
  refreshToken?: string;
  refreshTokenExpiresAt?: string;
};

const EIGHT_HOURS_MS = 28800000;

export async function refreshGitHubUserToken(
  refreshToken: string,
): Promise<TRefreshedTokens> {
  const app = new App({
    oauth: {
      clientId: process.env.GITHUB_APP_CLIENT_ID!,
      clientSecret: process.env.GITHUB_APP_CLIENT_SECRET!,
    },
    appId: process.env.GITHUB_APP_ID!,
    privateKey: process.env.GITHUB_APP_PRIVATE_KEY!,
  });

  const { authentication } = await app.oauth.refreshToken({ refreshToken });
  const auth = authentication as typeof authentication & TExpiringTokenFields;

  return {
    access_token: auth.token,
    refresh_token: auth.refreshToken || refreshToken,
    access_token_expires_at: auth.expiresAt
      ? new Date(auth.expiresAt).getTime()
      : Date.now() + EIGHT_HOURS_MS,
    refresh_token_expires_at: auth.refreshTokenExpiresAt
      ? new Date(auth.refreshTokenExpiresAt).getTime()
      : undefined,
  };
}

export async function refreshGitLabToken(
  refreshToken: string,
  origin: string,
): Promise<TRefreshedTokens> {
  const response = await fetch("https://gitlab.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.NEXT_PUBLIC_GITLAB_CLIENT_ID,
      client_secret: process.env.GITLAB_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
      redirect_uri: `${origin}/gitlab-installed`,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error_description || "Failed to refresh token");
  }

  const data = await response.json();
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    access_token_expires_at: Date.now() + data.expires_in * 1000,
  };
}

export const requestOrigin = (request: Request): string => {
  const host = request.headers.get("host") || "localhost:3000";
  const protocol = request.headers.get("x-forwarded-proto") || "http";
  return `${protocol}://${host}`;
};
