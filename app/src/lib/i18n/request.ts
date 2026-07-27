import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { namespaces } from "./namespaces";
import { routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  // Validate the locale coming from the [locale] segment
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  const modules = await Promise.all(
    namespaces.map((ns) => import(`../../i18n/${locale}/${ns}.json`)),
  );

  const messages = Object.assign({}, ...modules.map((m) => m.default));

  return { locale, messages };
});
