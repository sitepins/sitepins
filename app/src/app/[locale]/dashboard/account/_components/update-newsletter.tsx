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
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { authClient, Session } from "@/lib/auth/auth-client";
import { BetterFetchError } from "better-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

export default function UpdateNewsletterSubscription({
  auth,
}: {
  auth: Session;
}) {
  const [error, setError] = useState<
    (BetterFetchError & Record<string, any>) | null
  >(null);
  const { user } = auth;

  const [isPending, setIsPending] = useState(false);
  const [checked, setChecked] = useState<boolean>(!!user.subscribed);
  const router = useRouter();

  const tDashboardAccountNewsletter = useTranslations(
    "dashboard.account.newsletter",
  );

  const handleSave = async () => {
    await authClient.updateUser(
      { subscribed: checked },
      {
        onRequest: () => setIsPending(true),
        onResponse: () => setIsPending(false),
        onSuccess: () => {
          toast.success(
            checked
              ? tDashboardAccountNewsletter("success_sub")
              : tDashboardAccountNewsletter("success_unsub"),
          );
          router.refresh();
        },
        onError: (ctx: { error: { message: any } }) => {
          toast.error(
            ctx.error.message || tDashboardAccountNewsletter("error"),
          );
        },
      },
    );
  };

  return (
    <Card id="newsletter">
      <CardHeader>
        <CardTitle>{tDashboardAccountNewsletter("title")}</CardTitle>
        <CardDescription>
          {tDashboardAccountNewsletter("description")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start space-x-2">
          <Checkbox
            id="newsletter-sub"
            checked={checked}
            onCheckedChange={(v) => {
              setChecked(!!v);
            }}
            className="mt-0.5"
          />
          <div className="flex-1">
            <Label htmlFor="newsletter-sub" className="text-sm">
              {tDashboardAccountNewsletter("label")}
            </Label>
          </div>
        </div>

        <div className="mt-3">
          <FormError
            error={error}
            onReset={() => {
              setError(null);
            }}
          />
        </div>
      </CardContent>
      <CardFooter>
        <Button
          className="w-full sm:w-auto"
          isLoading={isPending}
          disabled={checked === !!user.subscribed}
          onClick={handleSave}
        >
          {tDashboardAccountNewsletter("submit")}
        </Button>
      </CardFooter>
    </Card>
  );
}
