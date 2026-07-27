export type TProvider = {
  _id?: string;
  user_id: string;
  provider: "Github" | "Gitlab";
  accessToken: string;
  accessTokenExpiresAt?: number | Date | string;
  installationAccessToken: string;
  tokenType: string;
  refreshToken: string;
  refreshTokenExpiresAt?: number | Date | string;
  lastRefreshedAt?: number | Date | string;
};
