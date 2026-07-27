"use client";

import CookieConsent from "@/components/cookie-consent";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PartneroCustomerSync } from "@/helpers/partnero-customer-sync";
import TwSizeIndicator from "@/helpers/tw-size-indicator";
import { ThemeProvider } from "next-themes";
import React from "react";
import LimitChecker from "./limit-checker";
import PostHogProvider from "./posthog-provider";
import { RtkProviders } from "./rtk-provider";

type AppProvidersProps = {
  children: React.ReactNode;
};

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <>
      <PartneroCustomerSync />
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableColorScheme={false}
      >
        <TooltipProvider
          disableHoverableContent
          delayDuration={500}
          skipDelayDuration={0}
        >
          <TwSizeIndicator />
          <RtkProviders>
            <CookieConsent />
            <PostHogProvider>
              <LimitChecker />
              {children}
            </PostHogProvider>
          </RtkProviders>
        </TooltipProvider>
        <Toaster />
      </ThemeProvider>
    </>
  );
}
