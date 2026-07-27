"use client";

import { authClient } from "@/lib/auth/auth-client";
import { confirmPasswordSchema, forgotPasswordSchema } from "@/lib/validate";
import { zodResolver } from "@hookform/resolvers/zod";
import { BetterFetchError } from "better-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { z } from "zod/v4";
import ForgotPasswordView from "./_components/forget-pass";
import LinkExpiredView from "./_components/link-expired";
import ResetPasswordView from "./_components/reset-pass";

type MaybeBetterError = (BetterFetchError & Record<string, any>) | null;

export default function ForgetPassword() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const error = searchParams.get("error") as "INVALID_TOKEN" | null;

  const [isPending, setIsPending] = useState(false);
  const router = useRouter();
  const [isSuccess, setIsSuccess] = useState(false);
  const [betterError, setBetterError] = useState<MaybeBetterError>(null);

  const forgetForm = useForm<z.infer<typeof forgotPasswordSchema>>({
    defaultValues: {
      email: "",
    },
    resolver: zodResolver(forgotPasswordSchema),
  });

  const confirmPasswordForm = useForm<z.infer<typeof confirmPasswordSchema>>({
    resolver: zodResolver(confirmPasswordSchema),
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
  });

  const tAuth = useTranslations("auth.forgot_password");

  const onSubmit = useCallback(
    async (value: z.infer<typeof forgotPasswordSchema>) => {
      await authClient.requestPasswordReset(
        {
          email: value.email,
          redirectTo: window.location.origin + "/forgot-password",
        },
        {
          onRequest: () => setIsPending(true),
          onResponse: () => setIsPending(false),
          onSuccess: () => {
            setIsSuccess(true);
            forgetForm.reset();
          },
          onError: (ctx) => setBetterError(ctx.error),
        },
      );
    },
    [forgetForm],
  );

  const onPassResetSubmit = useCallback(
    async (data: z.infer<typeof confirmPasswordSchema>) => {
      await authClient.resetPassword(
        {
          newPassword: data.password,
          token: token!,
        },
        {
          onRequest: () => setIsPending(true),
          onResponse: () => setIsPending(false),
          onSuccess: () => {
            toast.success(tAuth("success_toast"));
            router.push("/login");
          },
          onError: (ctx) => setBetterError(ctx.error),
        },
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [router, toast, token, tAuth],
  );

  // expired token view
  if (error === "INVALID_TOKEN") {
    return <LinkExpiredView />;
  }

  if (!!token) {
    return (
      <ResetPasswordView
        form={confirmPasswordForm}
        onSubmit={onPassResetSubmit}
        isPending={isPending}
        betterError={betterError}
        onResetError={() => setBetterError(null)}
      />
    );
  }

  return (
    <ForgotPasswordView
      form={forgetForm}
      onSubmit={onSubmit}
      isPending={isPending}
      isSuccess={isSuccess}
      betterError={betterError}
      onResetError={() => setBetterError(null)}
    />
  );
}
