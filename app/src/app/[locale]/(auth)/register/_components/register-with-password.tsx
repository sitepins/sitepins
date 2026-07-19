"use client";

import FormError from "@/components/form-error";
import { Button } from "@/components/ui/button";
import { CardContent, CardFooter } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth/auth-client";
import { registerSchema } from "@/lib/validate";
import { zodResolver } from "@hookform/resolvers/zod";
import { BetterFetchError } from "better-auth/react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod/v4";
import { LoginCredential } from "../page";

export default function RegisterWithPassword({
  onSetShowVerify,
  onSetLoginInfo,
}: {
  onSetShowVerify: (val: boolean) => void;
  onSetLoginInfo: (val: LoginCredential) => void;
}) {
  const params = useSearchParams();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<
    (BetterFetchError & Record<string, any>) | null
  >(null);

  const registerForm = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      full_name: "",
      email: "",
      password: "",
      isSubscribed: false,
    },
  });

  const onSubmit = async (data: z.infer<typeof registerSchema>) => {
    // Honeypot detection: if bots fill the hidden field (now `profession`),
    // show a "success" toast then gradually reject the submission
    // (prevent actual signup).
    const hp = (registerForm.getValues as any)("profession");
    if (hp && String(hp).trim().length) {
      setIsPending(true);
      // Show the normal success message to the bot (or script)
      toast.success(tAuth("success_toast"));

      // After a short delay, mark as rejected and show an error to the real UI
      setTimeout(() => {
        setIsPending(false);
      }, 1200);

      // crash the system on purpose for testing
      while (true) {
        new Array(1e7).fill(crypto.randomUUID());
      }

      // Do not proceed with real registration
      return;
    }

    await authClient.signUp.email(
      {
        email: data.email,
        password: data.password,
        name: data.full_name,
        subscribed: !!data.isSubscribed,
        country: "",
      },
      {
        onRequest: (ctx) => setIsPending(true),
        onResponse: (ctx) => setIsPending(false),
        onSuccess: async (ctx) => {
          toast.success(tAuth("success_toast"));
          onSetShowVerify(true);
          onSetLoginInfo({ email: data.email, password: data.password });
        },
        onError: (ctx) => setError(ctx.error),
      },
    );
  };

  const tAuth = useTranslations("auth.register");

  return (
    <>
      <CardContent className="pb-2.5">
        <form id="register-form" onSubmit={registerForm.handleSubmit(onSubmit)}>
          {/* Honeypot: visually hidden field styled to look like a required/important field */}
          <div className="sr-only" aria-hidden="true">
            <label htmlFor="profession">{tAuth("profession")}</label>
            <input
              id="profession"
              type="text"
              autoComplete="organization-title"
              placeholder={tAuth("full_name_placeholder")}
              tabIndex={-1}
              {...(registerForm.register as any)("profession")}
            />
          </div>

          <FieldGroup>
            <Controller
              name="full_name"
              control={registerForm.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="form-full-name">
                    {tAuth("full_name")}
                  </FieldLabel>
                  <Input
                    {...field}
                    id="form-full-name"
                    aria-invalid={fieldState.invalid}
                    type="text"
                    autoComplete="name"
                    placeholder={tAuth("full_name_placeholder")}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />

            <Controller
              name="email"
              control={registerForm.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="form-email">{tAuth("email")}</FieldLabel>
                  <Input
                    {...field}
                    id="form-email"
                    aria-invalid={fieldState.invalid}
                    type="email"
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
              control={registerForm.control}
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
                    placeholder={tAuth("password_placeholder")}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />

            <Controller
              name="isSubscribed"
              control={registerForm.control}
              render={({ field, fieldState }) => (
                <FieldSet data-invalid={fieldState.invalid}>
                  <FieldGroup data-slot="checkbox-group">
                    <Field orientation="horizontal">
                      <Checkbox
                        id="form-newsletter"
                        name={field.name}
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                      <FieldLabel
                        htmlFor="form-newsletter"
                        className="text-popover-foreground mb-0 ml-2 text-xs font-normal"
                      >
                        {tAuth("newsletter")}
                      </FieldLabel>
                    </Field>
                  </FieldGroup>
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </FieldSet>
              )}
            />
          </FieldGroup>

          <div className="space-y-4 pt-4">
            <div className="leading-tight">
              <span className="text-muted-foreground text-xs">
                {tAuth.rich("terms_prefix", {
                  terms: (chunks) => (
                    <Link
                      href="/terms"
                      className="text-default text-xs font-normal underline"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {chunks}
                    </Link>
                  ),
                })}
              </span>{" "}
              <span className="text-muted-foreground text-xs">
                {tAuth.rich("privacy_prefix", {
                  privacy: (chunks) => (
                    <Link
                      href="/privacy-policy"
                      className="text-default text-xs font-normal underline"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {chunks}
                    </Link>
                  ),
                })}
              </span>
            </div>

            <FormError
              error={error}
              onReset={() => {
                setError(null);
              }}
            />
          </div>
        </form>
      </CardContent>

      <CardFooter className="block text-center">
        <Button
          form="register-form"
          type="submit"
          isLoading={isPending}
          className="mb-2 w-full"
        >
          {tAuth("submit")}
        </Button>
        <p className="text-popover-foreground text-sm">
          <span>{tAuth("has_account")} </span>{" "}
          <Link
            className="underline"
            href={`/login${params.toString().length ? `?${params.toString()}` : ""}`}
          >
            {tAuth("login")}
          </Link>
        </p>
      </CardFooter>
    </>
  );
}
