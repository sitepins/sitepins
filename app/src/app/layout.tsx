import { AppProviders } from "@/helpers/app-providers";
import { BRAND_APPLE_ICON, BRAND_FAVICON, BRAND_NAME } from "@/lib/brand";
import config from "@/lib/config";
import MaintenanceScreen from "@/partials/maintenance";
import { getDirection } from "@/lib/i18n/direction";
import "@/styles/main.css";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { Inter } from "next/font/google";
import React from "react";

const primaryFont = Inter({ subsets: ["latin", "latin-ext"] });

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (config.maintenance.enabled) {
    const locale = await getLocale();
    const messages = await getMessages();
    return (
      <NextIntlClientProvider locale={locale} messages={messages}>
        <MaintenanceScreen />
      </NextIntlClientProvider>
    );
  }

  const locale = await getLocale();

  return (
    <html
      suppressHydrationWarning
      lang={locale}
      dir={getDirection(locale)}
      className="overflow-x-hidden"
    >
      <head>
        {/* responsive meta */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=5"
        />

        {/* favicon & app icons */}
        <link rel="icon" href={BRAND_FAVICON} />
        <link rel="apple-touch-icon" href={BRAND_APPLE_ICON} />
        <link rel="manifest" href="/manifest.webmanifest" />

        {/* PWA metadata */}
        <meta name="application-name" content={BRAND_NAME} />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content={BRAND_NAME} />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta
          name="theme-color"
          media="(prefers-color-scheme: light)"
          content="#ffffff"
        />
        <meta
          name="theme-color"
          media="(prefers-color-scheme: dark)"
          content="#1c1c1c"
        />

        <title>{BRAND_NAME}</title>
      </head>

      <body className={primaryFont.className} suppressHydrationWarning={true}>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
