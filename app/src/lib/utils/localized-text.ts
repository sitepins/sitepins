/* eslint-disable @typescript-eslint/no-require-imports */
import languages from "@/config/languages.json";

export const locales = languages.map((l) => l.code);
export type Locale = string;

export const getMenuTranslations = (locale: string) => {
  return require(`../../i18n/${locale}/navigation.json`).navigation.menu;
};

export type TLocalizedText = string | Record<string, string>;

export const resolveLocalizedText = (
  value: TLocalizedText | undefined,
  locale: string,
): string => {
  if (!value) return "";
  if (typeof value === "string") return value;

  if (
    locale in value &&
    typeof value[locale as keyof typeof value] === "string"
  ) {
    return value[locale as keyof typeof value] as string;
  }

  // Fallback to "en" if available
  if (typeof value.en === "string") return value.en;

  // Fallback to the first available localized string
  const keys = Object.keys(value);
  if (keys.length > 0 && typeof value[keys[0]] === "string") {
    return value[keys[0]];
  }

  return "";
};
