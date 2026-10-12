import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { BRAND_NAME, CONFIG_DIR } from "@/lib/brand";
import { namespaces } from "./namespaces";
import { routing } from "./routing";

function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
) {
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === "object" &&
      !Array.isArray(source[key]) &&
      target[key] &&
      typeof target[key] === "object" &&
      !Array.isArray(target[key])
    ) {
      deepMerge(
        target[key] as Record<string, unknown>,
        source[key] as Record<string, unknown>,
      );
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

// Brand tokens in locale files. Substituted before next-intl parses the
// messages, so no call site passes them. Values are ICU-escaped: braces and
// tag brackets are dropped and apostrophes doubled.
const icuSafe = (value: string) =>
  value.replace(/[{}<>]/g, "").replace(/'/g, "''");

const BRAND_TOKENS: Record<string, string> = {
  "{brand}": icuSafe(BRAND_NAME),
  "{configDir}": icuSafe(CONFIG_DIR),
};

export function applyBrandTokens<T>(value: T): T {
  if (typeof value === "string") {
    return value.replace(
      /\{brand\}|\{configDir\}/g,
      (token) => BRAND_TOKENS[token],
    ) as T;
  }
  if (Array.isArray(value)) return value.map(applyBrandTokens) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, applyBrandTokens(v)]),
    ) as T;
  }
  return value;
}

export default getRequestConfig(async ({ requestLocale }) => {
  // Validate the locale coming from the [locale] segment
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  const modules = await Promise.all(
    namespaces.map((ns) => import(`../../i18n/${locale}/${ns}.json`)),
  );

  const messages = modules.reduce<Record<string, unknown>>(
    (acc, m) => deepMerge(acc, m.default || {}),
    {},
  );

  return { locale, messages: applyBrandTokens(messages) };
});
