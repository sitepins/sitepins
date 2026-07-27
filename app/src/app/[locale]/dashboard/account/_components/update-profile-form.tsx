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
import { authClient, Session } from "@/lib/auth/auth-client";
import { IS_DEMO } from "@/lib/constant";
import { userDetailsSchema } from "@/lib/validate";
import { zodResolver } from "@hookform/resolvers/zod";
import { BetterFetchError } from "better-auth/react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod/v4";

export type UserDetailsPayload = z.infer<typeof userDetailsSchema>;

export default function UserDetailsForm({ auth }: { auth: Session }) {
  const [error, setError] = useState<
    (BetterFetchError & Record<string, any>) | null
  >(null);

  const [isPending, setIsPending] = useState(false);
  const { user } = auth;
  const router = useRouter();

  const userDetailsForm = useForm<UserDetailsPayload>({
    resolver: zodResolver(userDetailsSchema),
    defaultValues: {
      full_name: user.full_name || "",
      image: user.image || "",
    },
  });

  const tDashboardAccountProfile = useTranslations("dashboard.account.profile");

  const onSubmit = async (values: UserDetailsPayload) => {
    if (IS_DEMO) {
      toast.error(tDashboardAccountProfile("demo_error"));
      return;
    }

    await authClient.updateUser(
      {
        name: values.full_name,
      },
      {
        onRequest: () => setIsPending(true),
        onResponse: () => setIsPending(false),
        onSuccess: () => {
          toast.success(tDashboardAccountProfile("success"));
          router.refresh();
        },
        onError: (ctx: { error: BetterFetchError }) => {
          toast.error(ctx.error.message || tDashboardAccountProfile("error"));
        },
      },
    );
  };

  const isFormDirty = userDetailsForm.formState.isDirty;

  return (
    <Card id="display-name">
      <CardHeader>
        <CardTitle>{tDashboardAccountProfile("title")}</CardTitle>
        <CardDescription>
          {tDashboardAccountProfile("description")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          id="user-details-form"
          className="w-full space-y-4"
          onSubmit={userDetailsForm.handleSubmit(onSubmit)}
        >
          <FieldGroup>
            <Controller
              name="full_name"
              control={userDetailsForm.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="form-full_name">
                    {tDashboardAccountProfile("full_name")}
                  </FieldLabel>
                  <Input
                    {...field}
                    id="form-full_name"
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
          disabled={!isFormDirty || IS_DEMO}
          form="user-details-form"
          isLoading={isPending}
          type="submit"
        >
          {tDashboardAccountProfile("submit")}
        </Button>
      </CardFooter>
    </Card>
  );
}
