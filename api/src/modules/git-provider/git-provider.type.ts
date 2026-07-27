import mongoose from "mongoose";

export type GitProviderType = {
  _id: mongoose.Types.ObjectId;
  user_id: string;

  provider: "Github" | "Gitlab";
  token_type: string;

  access_token: string;
  access_token_expires_at?: Date;

  refresh_token?: string;
  refresh_token_expires_at?: Date;

  installation_access_token: string;
  last_refreshed_at?: Date;
};
