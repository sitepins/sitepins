import mongoose, { model } from "mongoose";
import {
  TUserPreferenceModel,
  EUserPreferenceTheme,
  TUserPreferenceType,
} from "./user-preference.type";

const userPreferenceSchema = new mongoose.Schema<
  TUserPreferenceType,
  TUserPreferenceModel
>(
  {
    user_id: {
      type: String,
      required: true,
      unique: true,
    },
    theme: {
      type: String,
      enum: Object.values(EUserPreferenceTheme),
      default: EUserPreferenceTheme.SYSTEM,
    },
    language: {
      type: String,
      default: "en",
    },
    timezone: {
      type: String,
      default: "UTC",
    },
    impersonate: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

export const UserPreference = model<TUserPreferenceType, TUserPreferenceModel>(
  "user_preference",
  userPreferenceSchema,
);
