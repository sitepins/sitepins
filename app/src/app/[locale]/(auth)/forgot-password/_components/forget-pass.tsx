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
import { Mail } from "lucide-react";
import Link from "next/link";
import { Controller, type UseFormReturn } from "react-hook-form";
import { useTranslations } from "next-intl";

type MaybeBetterError = (BetterFetchError & Record<string, any>) | null;

export default function ForgotPasswordView({
  form,
  onSubmit,
  isPending,
  isSuccess,
  betterError,
  onResetError,
}: {
  form: UseFormReturn<any>;
  onSubmit: (data: any) => void | Promise<void>;
  isPending: boolean;
  isSuccess: boolean;
  betterError: MaybeBetterError;
  onResetError: () => void;
}) {
  const tAuth = useTranslations("auth.forgot_password");
  const tLogin = useTranslations("auth.login");

  return (
    <>
      <CardHeader>
        <CardTitle>{tAuth("title")}</CardTitle>
        <CardDescription>{tAuth("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          id="form-reset-pass"
          className="space-y-4 text-left"
          onSubmit={form.handleSubmit(onSubmit)}
        >
          <FieldGroup>
            {!isSuccess && (
              <Controller
                name="email"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="form-email">
                      {tAuth("email")}
                    </FieldLabel>
                    <Input
                      {...field}
                      id="form-email"
                      aria-invalid={fieldState.invalid}
                      type="email"
                      autoComplete="off"
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />
            )}
          </FieldGroup>

          <FormError error={betterError} onReset={onResetError} />

          {isSuccess && (
            <div className="border-success/10 bg-success/5 rounded-lg border p-4">
              <div className="flex items-start gap-3">
                <div className="bg-success/10 flex-none rounded-full p-2">
                  <Mail className="text-success size-5" />
                </div>
                <div className="flex-1">
                  <p className="text-success text-sm font-semibold">
                    {tAuth("success_title")}
                  </p>
                  <p className="text-success mt-1 text-sm">
                    {tAuth("success_desc")}
                  </p>
                </div>
              </div>
            </div>
          )}
        </form>
      </CardContent>
      <CardFooter className="block text-center">
        {!isSuccess && (
          <Button
            form="form-reset-pass"
            isLoading={isPending}
            type="submit"
            className="w-full"
          >
            {tAuth("submit")}
          </Button>
        )}
        <p className="text-popover-foreground mt-1 text-sm">
          {tAuth("remembered")}{" "}
          <Link className="underline" href="/login">
            {tLogin("title")}
          </Link>
        </p>
      </CardFooter>
    </>
  );
}
