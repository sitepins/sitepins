import { Model } from "mongoose";

export enum UserPreferenceTheme {
  SYSTEM = "system",
  LIGHT = "light",
  DARK = "dark",
}

export type UserPreferenceType = {
  user_id: string;
  theme: UserPreferenceTheme;
  language: string;
  timezone: string;
  impersonate: boolean;
};

export type IUserPreferenceFilter = {
  search?: string;
};

export type UserPreferenceModel = Model<UserPreferenceType, object>;
