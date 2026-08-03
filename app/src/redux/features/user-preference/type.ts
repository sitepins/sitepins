export enum EUserPreferenceTheme {
  SYSTEM = "system",
  LIGHT = "light",
  DARK = "dark",
}

export type TUserPreference = {
  user_id: string;
  theme: EUserPreferenceTheme;
  impersonate: boolean;
  language: string;
};
