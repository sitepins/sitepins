"use client";

import CookieConsent from "@/components/cookie-consent";
import { Toaster } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import TwSizeIndicator from "@/helpers/tw-size-indicator";
import { ThemeProvider } from "next-themes";
import React from "react";
import { RtkProviders } from "./rtk-provider";

type AppProvidersProps = {
  children: React.ReactNode;
};

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableColorScheme={false}
    >
      <TooltipProvider delay={500}>
        <TwSizeIndicator />
        <RtkProviders>
          <CookieConsent />
          {children}
        </RtkProviders>
      </TooltipProvider>
      <Toaster />
    </ThemeProvider>
  );
}
