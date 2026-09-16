"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { safeInternalPath } from "@/lib/safe-redirect";
import { AlertCircle } from "lucide-react";
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

  const oauthError = params.get("error");
  const oauthErrorDescription = params.get("error_description");

  const getOAuthErrorMessage = (code: string | null): string | null => {
    if (!code) return null;
    switch (code) {
      case "unable_to_link_account":
        return "Unable to link this social account. If you previously had an account with this provider, please contact support or try logging in with your email and password.";
      case "account_not_linked":
        return "An account with this email already exists. Please log in with your email and password first.";
      case "account_already_linked_to_different_user":
        return "This social account is already linked to a different Sitepins user.";
      case "email_does_not_match":
        return "The email associated with this social account does not match your account.";
      case "access_denied":
        return "Access was denied or canceled during social login.";
      default:
        return (
          oauthErrorDescription || "Authentication failed. Please try again."
        );
    }
  };

  const errorMessage = getOAuthErrorMessage(oauthError);

  if (showVerify) return <OTPVerifyForm credential={loginInfo} />;

  return (
    <>
      {errorMessage && (
        <div className="px-6 pt-4">
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        </div>
      )}
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
