export const RTL_LOCALES = ["ar", "fa", "he", "ur"] as const;

export function getDirection(locale: string): "rtl" | "ltr" {
  return RTL_LOCALES.includes(locale as (typeof RTL_LOCALES)[number])
    ? "rtl"
    : "ltr";
}
