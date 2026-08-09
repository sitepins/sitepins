import { TGitProvider } from "@/lib/utils/provider-checker";

export type TProvider = {
  _id?: string;
  user_id: string;
  provider: TGitProvider;
  accessToken: string;
  accessTokenExpiresAt?: number | Date | string;
  installationAccessToken: string;
  tokenType: string;
  refreshToken: string;
  refreshTokenExpiresAt?: number | Date | string;
  lastRefreshedAt?: number | Date | string;
};
