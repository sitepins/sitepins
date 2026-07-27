"use client";

import { Button } from "@/components/ui/button";
import { CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { authClient } from "@/lib/auth/auth-client";
import { SiGithub, SiGoogle } from "@icons-pack/react-simple-icons";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

export function SocialAuth({
  title,
  redirect_url,
}: {
  title: string;
  redirect_url: string;
}) {
  const router = useRouter();

  const loginWithGoogle = async () => {
    try {
      await authClient.signIn.social(
        {
          provider: "google",
          callbackURL: window.location.origin + redirect_url,
        },
        {
          onSuccess: (context) => {
            const redirectUrl = context?.data?.url;
            if (redirectUrl) {
              window.location.href = redirectUrl;
              return;
            }
            router.refresh();
          },
          onError: (error) => {
            console.error("Google sign-in error:", error);
          },
        },
      );
    } catch (error) {
      console.error("Google sign-in failed:", error);
    }
  };

  const loginWithGithub = async () => {
    try {
      await authClient.signIn.social(
        {
          provider: "github",
          callbackURL: window.location.origin + redirect_url,
        },
        {
          onSuccess: (context) => {
            const redirectUrl = context?.data?.url;
            if (redirectUrl) {
              window.location.href = redirectUrl;
              return;
            }
            router.refresh();
          },
          onError: (error) => {
            console.error("GitHub sign-in error:", error);
          },
        },
      );
    } catch (error) {
      console.error("GitHub sign-in failed:", error);
    }
  };

  const tAuthSocial = useTranslations("auth.social");

  return (
    <CardHeader className="pb-2">
      {title && <CardTitle className="mb-4 font-semibold">{title}</CardTitle>}

      <div className="space-y-2">
        <Button
          type="button"
          variant={"outline"}
          className="border-border w-full border"
          onClick={loginWithGithub}
        >
          <SiGithub className="size-5" />
          <span className="ml-2">{tAuthSocial("github")}</span>
        </Button>
        <Button
          type="button"
          variant={"outline"}
          className="border-border w-full border"
          onClick={loginWithGoogle}
        >
          <SiGoogle className="size-5" />
          <span className="ml-2">{tAuthSocial("google")}</span>
        </Button>
      </div>

      <div className="items flex items-center space-x-3 pt-3">
        <Separator className="flex-1" />
        <p className="bg-card text-muted-foreground inline-block flex-1 text-sm whitespace-nowrap">
          {tAuthSocial("email")}
        </p>
        <Separator className="flex-1" />
      </div>
    </CardHeader>
  );
}
