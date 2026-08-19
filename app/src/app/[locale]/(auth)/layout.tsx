"use client";

import { logger } from "@/lib/logger";
import Loading from "@/components/loading";
import Logo from "@/components/logo";
import { Card } from "@/components/ui/card";
import { authClient } from "@/lib/auth/auth-client";
import { BRAND_URL } from "@/lib/brand";
import { DEMO_EMAIL, DEMO_PASSWORD, IS_DEMO } from "@/lib/constant";
import LanguageSwitcher from "@/layouts/components/language-switcher";
import { safeInternalPath } from "@/lib/safe-redirect";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (IS_DEMO) {
      async function autoDemoSignin() {
        await authClient.signIn.email(
          {
            email: DEMO_EMAIL!,
            password: DEMO_PASSWORD!,
            rememberMe: true,
          },
          {
            onSuccess: (_ctx) => {
              // Preserve the deep link the middleware stashed in `?from=`
              const from = safeInternalPath(
                new URLSearchParams(window.location.search).get("from"),
              );
              window.location.href = new URL(
                `/onboarding?from=${encodeURIComponent(from)}`,
                window.location.origin,
              ).toString();
            },
            onError: (error) => {
              logger.error("Sign-in failed", error);
            },
          },
        );
      }
      autoDemoSignin();
    }
  }, []);

  const [shouldShowLoader] = useState(IS_DEMO);
  const tAuth = useTranslations("auth");

  if (shouldShowLoader) {
    return (
      <div className="bg-light flex min-h-svh flex-col items-center justify-center py-10">
        <Loading className="text-default" />
      </div>
    );
  }

  return (
    <section>
      <div className="container">
        <div className="flex min-h-svh flex-col items-center justify-center">
          <div className="w-full max-w-lg px-4 py-10 text-center">
            <Logo link={BRAND_URL} className="mb-2" />
            <h1 className="text-muted-foreground mb-8 text-xl font-medium">
              {tAuth("tagline")}
            </h1>
            <Card className="w-full border-0 text-start">{children}</Card>
            <div className="mt-6 flex justify-center">
              <LanguageSwitcher compact />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
