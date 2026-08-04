import mongoose, { model } from "mongoose";
import { TGitProviderType } from "./git-provider.type";

const gitProviderSchema = new mongoose.Schema<TGitProviderType>(
  {
    user_id: {
      type: String,
      required: true,
    },
    access_token: {
      type: String,
      required: true,
    },
    access_token_expires_at: {
      type: Date,
    },
    refresh_token: {
      type: String,
    },
    // HMAC of the plaintext refresh token. Tokens are stored encrypted with a
    // random IV, so rotation can't look them up by value — this can.
    refresh_token_index: {
      type: String,
      index: true,
    },
    refresh_token_expires_at: {
      type: Date,
    },
    provider: {
      type: String,
      required: true,
      enum: ["Github", "Gitlab"],
    },
    token_type: {
      type: String,
      required: true,
    },
    installation_access_token: {
      type: String,
    },
    last_refreshed_at: {
      type: Date,
    },
  },
  {
    timestamps: true,
  },
);

gitProviderSchema.index({ provider: 1 });

export const GitProvider = model<TGitProviderType>(
  "git_provider",
  gitProviderSchema,
);
