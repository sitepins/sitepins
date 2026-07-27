import mongoose, { model } from "mongoose";
import {
  UserPreferenceModel,
  UserPreferenceTheme,
  UserPreferenceType,
} from "./user-preference.type";

const userPreferenceSchema = new mongoose.Schema<
  UserPreferenceType,
  UserPreferenceModel
>(
  {
    user_id: {
      type: String,
      required: true,
      unique: true,
    },
    theme: {
      type: String,
      enum: Object.values(UserPreferenceTheme),
      default: UserPreferenceTheme.SYSTEM,
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

export const UserPreference = model<UserPreferenceType, UserPreferenceModel>(
  "user_preference",
  userPreferenceSchema,
);
