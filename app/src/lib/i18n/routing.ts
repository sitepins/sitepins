import { defineRouting } from "next-intl/routing";
import { locales } from "@/lib/utils/localized-text";

export const routing = defineRouting({
  // Supported locales — dynamically loaded from languages.json via locales.ts
  locales: locales,

  // Default locale used when no locale prefix matches
  defaultLocale: "en",

  // Never show locale prefix in URL (e.g. /dashboard)
  localePrefix: "never",

  // Persist locale preference across browser sessions (1 year)
  // By default next-intl uses a session cookie (clears on browser close)
  localeCookie: {
    maxAge: 60 * 60 * 24 * 365,
  },
});

export type Locale = (typeof routing.locales)[number];
