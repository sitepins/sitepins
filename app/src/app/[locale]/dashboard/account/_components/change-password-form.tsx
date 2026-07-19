"use client";

import FormError from "@/components/form-error";
import { Button } from "@/components/ui/button";
import {
  Card,
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
import { authClient } from "@/lib/auth/auth-client";
import { updatePasswordSchema } from "@/lib/validate";
import { zodResolver } from "@hookform/resolvers/zod";
import { BetterFetchError } from "better-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import * as z from "zod/v4";

type UpdatePassPayload = z.infer<typeof updatePasswordSchema>;

export default function UpdatePassword() {
  const [error, setError] = useState<
    (BetterFetchError & Record<string, any>) | null
  >(null);

  const [isPending, setIsPending] = useState(false);
  const router = useRouter();

  const updatePasswordForm = useForm<UpdatePassPayload>({
    resolver: zodResolver(updatePasswordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
    },
  });

  const tDashboardAccountPassword = useTranslations(
    "dashboard.account.password",
  );

  const onSubmit = async (values: UpdatePassPayload) => {
    await authClient.changePassword(
      {
        newPassword: values.newPassword,
        currentPassword: values.currentPassword,
      },
      {
        onRequest: () => setIsPending(true),
        onResponse: () => setIsPending(false),
        onSuccess: () => {
          toast.success(tDashboardAccountPassword("success"));
          router.refresh();
          updatePasswordForm.reset();
        },
        onError: (ctx: { error: BetterFetchError }) => {
          toast.error(ctx.error.message || tDashboardAccountPassword("error"));
        },
      },
    );
  };

  return (
    <Card id="change-password">
      <CardHeader>
        <CardTitle>{tDashboardAccountPassword("title")}</CardTitle>
        <CardDescription>
          {tDashboardAccountPassword("description")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          id="change-password-form"
          onSubmit={updatePasswordForm.handleSubmit(onSubmit)}
        >
          <FieldGroup>
            <Controller
              name="currentPassword"
              control={updatePasswordForm.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="form-current-password">
                    {tDashboardAccountPassword("current_password")}
                  </FieldLabel>
                  <Input
                    {...field}
                    type="password"
                    id="form-current-password"
                    aria-invalid={fieldState.invalid}
                    autoComplete="off"
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />

            <Controller
              name="newPassword"
              control={updatePasswordForm.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="form-new-password">
                    {tDashboardAccountPassword("new_password")}
                  </FieldLabel>
                  <Input
                    {...field}
                    type="password"
                    id="form-new-password"
                    aria-invalid={fieldState.invalid}
                    autoComplete="off"
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
        </form>
      </CardContent>
      <CardFooter>
        <Button
          className="w-full sm:w-auto"
          disabled={!updatePasswordForm.formState.isDirty}
          form="change-password-form"
          isLoading={isPending}
          type="submit"
        >
          {tDashboardAccountPassword("submit")}
        </Button>
      </CardFooter>
    </Card>
  );
}
