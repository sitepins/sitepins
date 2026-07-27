export enum UserPreferenceTheme {
  SYSTEM = "system",
  LIGHT = "light",
  DARK = "dark",
}

export type TUserPreference = {
  user_id: string;
  theme: UserPreferenceTheme;
  impersonate: boolean;
  language: string;
};
