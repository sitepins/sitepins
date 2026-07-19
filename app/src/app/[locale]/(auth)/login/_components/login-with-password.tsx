"use client";

import FormError from "@/components/form-error";
import { Button } from "@/components/ui/button";
import { CardContent, CardFooter } from "@/components/ui/card";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth/auth-client";
import { IS_DEMO, POST_LOGIN_REDIRECT_KEY } from "@/lib/constant";
import { loginSchema } from "@/lib/validate";
import { zodResolver } from "@hookform/resolvers/zod";
import { type BetterFetchError } from "better-auth/react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import * as z from "zod/v4";
import { LoginCredential } from "../../register/page";
import { TRedirectUser } from "../page";

export default function LoginWithPassword({
  onSetShowVerify,
  onSetLoginInfo,
  redirectUser,
}: {
  onSetShowVerify: (val: boolean) => void;
  onSetLoginInfo: (val: LoginCredential) => void;
  redirectUser: TRedirectUser | null;
}) {
  const params = useSearchParams();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<
    (BetterFetchError & Record<string, any>) | null
  >(null);

  const loginForm = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: IS_DEMO
        ? process.env.NEXT_PUBLIC_DEMO_EMAIL
        : redirectUser?.email || "",
      password: IS_DEMO ? process.env.NEXT_PUBLIC_DEMO_PASSWORD : "",
    },
  });

  const onSubmit = async (data: z.infer<typeof loginSchema>) => {
    await authClient.signIn.email(
      {
        email: data.email,
        password: data.password,
        rememberMe: true,
      },
      {
        onRequest: () => {
          setIsPending(true);
        },
        onResponse: () => {
          setIsPending(false);
        },
        onSuccess: (ctx) => {
          const storedRedirect =
            typeof window !== "undefined"
              ? sessionStorage.getItem(POST_LOGIN_REDIRECT_KEY)
              : null;
          if (storedRedirect && typeof window !== "undefined") {
            sessionStorage.removeItem(POST_LOGIN_REDIRECT_KEY);
          }

          const from = params.get("from");
          const redirectTo = storedRedirect || from || "/";
          const onboardingRedirect = `/onboarding?redirect=${encodeURIComponent(redirectTo)}`;
          // Use window.location.href for full page navigation to bypass any router interception
          window.location.href = onboardingRedirect;
        },
        onError: (ctx) => {
          if (ctx.error.status === 403) {
            onSetShowVerify(true);
            onSetLoginInfo({ email: data.email, password: data.password });
          }
          setError(ctx.error);
        },
      },
    );
  };

  const tAuth = useTranslations("auth.login");

  return (
    <>
      <CardContent className="pb-2.5">
        <form id="login-form" onSubmit={loginForm.handleSubmit(onSubmit)}>
          <FieldGroup>
            <Controller
              name="email"
              control={loginForm.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="form-email">{tAuth("email")}</FieldLabel>
                  <Input
                    {...field}
                    id="form-email"
                    aria-invalid={fieldState.invalid}
                    type="email"
                    autoComplete="email"
                    placeholder={tAuth("email_placeholder")}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />

            <Controller
              name="password"
              control={loginForm.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="form-password">
                    {tAuth("password")}
                  </FieldLabel>
                  <Input
                    {...field}
                    id="form-password"
                    aria-invalid={fieldState.invalid}
                    type="password"
                    autoComplete="password"
                    placeholder={tAuth("password_placeholder")}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
          </FieldGroup>

          <FormError
            error={error}
            onReset={() => {
              setError(null);
            }}
          />

          <div className="text-right">
            <Link
              className="text-text-dark my-2 inline-block text-sm hover:underline"
              href={"/forgot-password"}
            >
              {tAuth("forgot_password")}
            </Link>
          </div>
        </form>
      </CardContent>

      <CardFooter className="block text-center">
        <Button
          form="login-form"
          type="submit"
          isLoading={isPending}
          className="mb-2 w-full"
        >
          {tAuth("submit")}
        </Button>
        <p className="text-popover-foreground text-sm">
          <span>{tAuth("no_account")}</span>{" "}
          <Link
            className="underline"
            href={`/register${params.toString().length ? `?${params.toString()}` : ""}`}
          >
            {tAuth("register")}
          </Link>
        </p>
      </CardFooter>
    </>
  );
}
