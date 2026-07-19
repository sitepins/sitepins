"use client";

import { LoginCredential } from "@/app/[locale]/(auth)/register/page";
import { Button } from "@/components/ui/button";
import {
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldError, FieldGroup } from "@/components/ui/field";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { authClient } from "@/lib/auth/auth-client";
import { OTP_LENGTH } from "@/lib/constant";
import { otpSchema } from "@/lib/validate";
import { zodResolver } from "@hookform/resolvers/zod";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod/v4";

function OTPGroupField({ index }: { index: number }) {
  return (
    <InputOTPGroup className="w-full *:data-[slot=input-otp-slot]:h-10 *:data-[slot=input-otp-slot]:flex-1 *:data-[slot=input-otp-slot]:text-lg">
      <InputOTPSlot index={index} />
    </InputOTPGroup>
  );
}

function OTPField({ field }: { field: any }) {
  return (
    <InputOTP
      value={field.value}
      onChange={field.onChange}
      pattern={REGEXP_ONLY_DIGITS}
      maxLength={OTP_LENGTH}
      containerClassName="w-full gap-2"
    >
      {Array.from({ length: OTP_LENGTH }).map((_, index) => (
        <OTPGroupField key={index} index={index} />
      ))}
    </InputOTP>
  );
}

export function OTPVerifyForm({ credential }: { credential: LoginCredential }) {
  const [isPending, setIsPending] = useState(false);

  const otpForm = useForm<z.infer<typeof otpSchema>>({
    resolver: zodResolver(otpSchema),
    defaultValues: {
      otp: "",
    },
  });

  const tAuthVerify = useTranslations("auth.verify");

  const onSubmit = async (data: z.infer<typeof otpSchema>) => {
    if (!credential.email) {
      toast.error(
        process.env.NODE_ENV === "development"
          ? tAuthVerify("email_missing")
          : tAuthVerify("something_went_wrong"),
      );
      return;
    }

    await authClient.emailOtp.verifyEmail(
      {
        email: credential.email,
        otp: data.otp,
      },
      {
        onResponse: () => setIsPending(false),
        onRequest: () => setIsPending(true),
        onSuccess: async () => {
          toast.success(tAuthVerify("success"));
          window.location.reload();
        },
        onError: (ctx) => {
          toast.error(ctx.error.message || tAuthVerify("something_went_wrong"));
        },
      },
    );
  };

  return (
    <>
      <CardHeader>
        <CardTitle>{tAuthVerify("title")}</CardTitle>
        <CardDescription>{tAuthVerify("description")}</CardDescription>
      </CardHeader>

      <CardContent>
        <form id="otp-verify-form" onSubmit={otpForm.handleSubmit(onSubmit)}>
          <FieldGroup>
            <Controller
              name="otp"
              control={otpForm.control}
              render={({ field, fieldState }) => (
                <Field
                  data-invalid={fieldState.invalid}
                  orientation="horizontal"
                >
                  <OTPField field={field} />
                  {fieldState.invalid && (
                    <FieldError className="mt-2" errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
          </FieldGroup>
        </form>
      </CardContent>
      <CardFooter>
        <Button
          form="otp-verify-form"
          disabled={isPending || !otpForm.formState.isValid}
          isLoading={isPending}
          type="submit"
          className="w-full"
        >
          {tAuthVerify("submit")}
        </Button>
      </CardFooter>
    </>
  );
}
