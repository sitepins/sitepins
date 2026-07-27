export type TProvider = {
  _id?: string;
  user_id: string;

  provider: "Github" | "Gitlab";
  token_type: string;

  access_token: string;
  access_token_expires_at?: number | Date | string;

  refresh_token: string;
  refresh_token_expires_at?: number | Date | string;

  installation_access_token: string;
  last_refreshed_at?: number | Date | string;
};
