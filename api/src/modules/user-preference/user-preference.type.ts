import { Model } from "mongoose";

export enum EUserPreferenceTheme {
  SYSTEM = "system",
  LIGHT = "light",
  DARK = "dark",
}

export type TUserPreferenceType = {
  user_id: string;
  theme: EUserPreferenceTheme;
  language: string;
  timezone: string;
  impersonate: boolean;
};

export type TUserPreferenceFilter = {
  search?: string;
};

export type TUserPreferenceModel = Model<TUserPreferenceType, object>;
