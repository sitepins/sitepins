"use client";

import { Button } from "@/components/ui/button";
import {
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import FormError from "@/components/form-error";
import { type BetterFetchError } from "better-auth/react";
import Link from "next/link";
import { Controller, type UseFormReturn } from "react-hook-form";
import { useTranslations } from "next-intl";

type MaybeBetterError = (BetterFetchError & Record<string, any>) | null;

export default function ResetPasswordView({
  form,
  onSubmit,
  isPending,
  betterError,
  onResetError,
}: {
  form: UseFormReturn<any>;
  onSubmit: (data: any) => void | Promise<void>;
  isPending: boolean;
  betterError: MaybeBetterError;
  onResetError: () => void;
}) {
  const tAuth = useTranslations("auth.reset_password");
  const tForgot = useTranslations("auth.forgot_password");
  const tLogin = useTranslations("auth.login");

  return (
    <>
      <CardHeader>
        <CardTitle>{tAuth("title")}</CardTitle>
        <CardDescription>{tAuth("description")}</CardDescription>
      </CardHeader>
      <CardContent className="pb-2.5">
        <form id="reset-pass-form" onSubmit={form.handleSubmit(onSubmit)}>
          <FieldGroup>
            <Controller
              name="password"
              control={form.control}
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
                    autoComplete="off"
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />

            <Controller
              name="confirmPassword"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="form-confirm-password">
                    {tAuth("confirm_password")}
                  </FieldLabel>
                  <Input
                    {...field}
                    id="form-confirm-password"
                    aria-invalid={fieldState.invalid}
                    type="password"
                    autoComplete="off"
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
          </FieldGroup>

          <FormError error={betterError} onReset={onResetError} />
        </form>
      </CardContent>
      <CardFooter className="block text-center">
        <Button
          form="reset-pass-form"
          isLoading={isPending}
          type="submit"
          className="w-full"
        >
          {tAuth("submit")}
        </Button>
        <p className="text-muted-foreground mt-2 text-sm">
          {tForgot("remembered")}{" "}
          <Link className="underline" href="/login">
            {tLogin("title")}
          </Link>
        </p>
      </CardFooter>
    </>
  );
}
