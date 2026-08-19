import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
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

  return { locale, messages };
});
