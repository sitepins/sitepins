import { AppProviders } from "@/helpers/app-providers";
import { PartneroScript } from "@/helpers/partnero-script";
import config from "@/lib/config";
import MaintenanceScreen from "@/partials/maintenance";
import "@/styles/main.css";
import { getLocale } from "next-intl/server";
import { Inter } from "next/font/google";
import React from "react";

const primaryFont = Inter({ subsets: ["latin", "latin-ext"] });

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (config.maintenance.enabled) return <MaintenanceScreen />;

  const locale = await getLocale();

  return (
    <html suppressHydrationWarning lang={locale} className="overflow-x-hidden">
      <head>
        {/* responsive meta */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=5"
        />

        {/* favicon */}
        <link rel="icon" href={config.site.favicon} />
        <meta name="msapplication-TileColor" content="#000000" />
        <meta
          name="theme-color"
          media="(prefers-color-scheme: light)"
          content="#fff"
        />
        <meta
          name="theme-color"
          media="(prefers-color-scheme: dark)"
          content="#000"
        />

        <title>{config.site.title}</title>
        <PartneroScript />
      </head>

      <body className={primaryFont.className} suppressHydrationWarning={true}>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
