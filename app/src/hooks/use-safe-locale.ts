"use client";

import { routing } from "@/lib/i18n/routing";
import { useParams } from "next/navigation";

type SupportedLocale = (typeof routing.locales)[number];

const isSupportedLocale = (value: string): value is SupportedLocale => {
  return routing.locales.includes(value as SupportedLocale);
};

export const useSafeLocale = (): SupportedLocale => {
  const params = useParams<{ locale?: string }>();
  const localeParam =
    typeof params?.locale === "string" ? params.locale : undefined;

  if (localeParam && isSupportedLocale(localeParam)) {
    return localeParam;
  }

  return routing.defaultLocale;
};
