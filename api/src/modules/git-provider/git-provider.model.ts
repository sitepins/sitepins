import mongoose, { model } from "mongoose";
import { GitProviderType } from "./git-provider.type";

const gitProviderSchema = new mongoose.Schema<GitProviderType>(
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
  }
);

gitProviderSchema.index({ provider: 1 });

export const GitProvider = model<GitProviderType>(
  "git_provider",
  gitProviderSchema
);
