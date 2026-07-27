"use client";

import { Button } from "@/components/ui/button";
import {
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";

export default function LinkExpiredView() {
  const tAuth = useTranslations("auth.link_expired");
  const tForgot = useTranslations("auth.forgot_password");
  const tLogin = useTranslations("auth.login");

  return (
    <>
      <CardHeader className="pb-2">
        <CardTitle className="font-semibold">{tAuth("title")}</CardTitle>
        <CardDescription className="mb-5 text-sm">
          {tAuth("description")}
        </CardDescription>
      </CardHeader>
      <CardContent className="pb-2.5">
        <p className="mb-3 text-sm">
          <AlertTriangle className="text-destructive mr-2 inline-block size-5" />
          {tAuth("message")}
        </p>
      </CardContent>
      <CardFooter className="block text-center">
        <Button className="mb-2 w-full">
          <Link href="/forgot-password">{tAuth("request_again")}</Link>
        </Button>
        <p className="text-popover-foreground text-sm">
          {tForgot("remembered")}{" "}
          <Link className="underline" href="/login">
            {tLogin("title")}
          </Link>
        </p>
      </CardFooter>
    </>
  );
}
