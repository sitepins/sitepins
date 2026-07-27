"use client";

import { useState } from "react";
import { OTPVerifyForm } from "./_components/otp-verify-form";
import RegisterWithPassword from "./_components/register-with-password";

export type LoginCredential = {
  email: string;
  password: string;
};

export default function Register() {
  const [showVerify, setShowVerify] = useState(false);
  const [loginInfo, setLoginInfo] = useState<LoginCredential>({
    email: "",
    password: "",
  });

  if (showVerify) return <OTPVerifyForm credential={loginInfo} />;

  return (
    <RegisterWithPassword
      onSetShowVerify={(val) => {
        setShowVerify(val);
      }}
      onSetLoginInfo={(val) => {
        setLoginInfo(val);
      }}
    />
  );
}
