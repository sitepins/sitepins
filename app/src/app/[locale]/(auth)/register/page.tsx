"use client";

import { safeInternalPath } from "@/lib/safe-redirect";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { OTPVerifyForm } from "./_components/otp-verify-form";
import RegisterWithPassword from "./_components/register-with-password";
import { SocialAuth } from "./_components/social-auth";

export type LoginCredential = {
  email: string;
  password: string;
};

export default function Register() {
  const [showVerify, setShowVerify] = useState(false);
  const params = useSearchParams();
  const from = safeInternalPath(params.get("from"));
  const callbackURL = `/onboarding?from=${encodeURIComponent(from)}`;
  const [loginInfo, setLoginInfo] = useState<LoginCredential>({
    email: "",
    password: "",
  });

  if (showVerify) return <OTPVerifyForm credential={loginInfo} />;

  return (
    <>
      <SocialAuth title="" redirect_url={callbackURL} />
      <RegisterWithPassword
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
