"use client";

import FormError from "@/components/form-error";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { newPasswordSchema } from "@/lib/validate";
import { useSetPasswordMutation } from "@/redux/features/user/user-api";
import { zodResolver } from "@hookform/resolvers/zod";
import { BetterFetchError } from "better-auth/react";
import { toast } from "sonner";
// loader handled by shared Button
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslations } from "next-intl";
import * as z from "zod/v4";

type NewPasspayload = z.infer<typeof newPasswordSchema>;

export default function SetNewPassword() {
  const [error, setError] = useState<
    (BetterFetchError & Record<string, any>) | null
  >(null);

  const router = useRouter();
  const [setPassword, { status }] = useSetPasswordMutation();

  const isPending = status === "pending";

  const newPasswordForm = useForm<NewPasspayload>({
    resolver: zodResolver(newPasswordSchema),
    defaultValues: {
      newPassword: "",
    },
  });

  const tDashboardAccountSetPassword = useTranslations(
    "dashboard.account.set_password",
  );

  const onSubmit = async (values: NewPasspayload) => {
    try {
      await setPassword({ newPassword: values.newPassword }).unwrap();
      toast.success(tDashboardAccountSetPassword("success"));
      router.refresh();
    } catch {
      setError({
        name: "set-password",
        error: "Something went wrong!",
        message: tDashboardAccountSetPassword("error"),
        status: 500,
        statusText: "Internal Server error",
      });
    }
  };

  return (
    <Card id="set-password">
      <CardHeader>
        <CardTitle>{tDashboardAccountSetPassword("title")}</CardTitle>
        <CardDescription>
          {tDashboardAccountSetPassword("description")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          id="set-password-form"
          onSubmit={newPasswordForm.handleSubmit(onSubmit)}
        >
          <FieldGroup>
            <Controller
              name="newPassword"
              control={newPasswordForm.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="form-new-password">
                    {tDashboardAccountSetPassword("new_password")}
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
          disabled={!newPasswordForm.formState.isDirty}
          form="set-password-form"
          isLoading={isPending}
          type="submit"
        >
          {tDashboardAccountSetPassword("submit")}
        </Button>
      </CardFooter>
    </Card>
  );
}
