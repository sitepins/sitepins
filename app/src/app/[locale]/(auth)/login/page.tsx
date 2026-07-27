"use client";

import { usePartnerLoginBridge } from "@/lib/partner-login";
import { ShieldCheck } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { OTPVerifyForm } from "../register/_components/otp-verify-form";
import { SocialAuth } from "../register/_components/social-auth";
import { LoginCredential } from "../register/page";
import LoginWithPassword from "./_components/login-with-password";
import { useTranslations } from "next-intl";

export type { TRedirectUser } from "@/lib/partner-login";

export default function Login() {
  const [showVerify, setShowVerify] = useState(false);
  const params = useSearchParams();
  const [loginInfo, setLoginInfo] = useState<LoginCredential>({
    email: "",
    password: "",
  });
  const from = params.get("from") || "/";
  const callbackURL = `/onboarding?from=${encodeURIComponent(from)}`;

  const { pending, redirectUser } = usePartnerLoginBridge({
    from,
    callbackURL,
  });

  const tAuth = useTranslations("auth.login");

  if (pending)
    return (
      <div className="flex flex-col items-center gap-5 px-6 py-10 text-center">
        {/* Icon badge */}
        <div className="bg-primary/10 text-primary flex size-14 items-center justify-center rounded-full">
          <ShieldCheck className="size-7" />
        </div>

        {/* Heading + sub-copy */}
        <div className="space-y-1.5">
          <h2 className="text-foreground text-lg font-semibold tracking-tight">
            {tAuth("authenticating")}
          </h2>
          <p className="text-muted-foreground max-w-xs text-sm">
            {tAuth("verifying_purchase")}
          </p>
        </div>
        {/* Shimmer progress bar */}
        <div className="bg-muted h-1 w-48 overflow-hidden rounded-full">
          <div className="bg-primary/60 animate-shimmer h-full w-1/2 rounded-full" />
        </div>
      </div>
    );

  if (showVerify) return <OTPVerifyForm credential={loginInfo} />;

  return (
    <>
      <SocialAuth title="" redirect_url={callbackURL} />
      <LoginWithPassword
        redirectUser={redirectUser}
        onSetShowVerify={(val) => {
          setShowVerify(val);
        }}
        onSetLoginInfo={(val) => {
          setLoginInfo(val);
        }}
      />
    </>
  );
}
