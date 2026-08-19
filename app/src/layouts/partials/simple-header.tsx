"use client";

import Avatar from "@/components/avatar";
import Logo from "@/components/logo";
import { Button } from "@/components/ui/button";
import { useHydrated } from "@/hooks/use-hydrated";
import { authClient } from "@/lib/auth/auth-client";
import { useTranslations } from "next-intl";
import Link from "next/link";

type TSession = ReturnType<typeof authClient.useSession>["data"];

export default function SimpleHeader({ auth }: { auth?: TSession }) {
  const tCommon = useTranslations("common");
  const tAuth = useTranslations("auth.login");
  const hasMounted = useHydrated();

  return (
    <header className="py-3">
      <div className="container">
        <div className="flex w-full items-center justify-between">
          <Logo />

          {hasMounted &&
            (auth?.user ? (
              <Link href="/dashboard/account" className="ms-4">
                <div className="flex items-center gap-3">
                  <Avatar
                    email={auth.user.email || ""}
                    alt={auth.user.full_name || tCommon("labels.name")}
                    src={auth.user.image || ""}
                    width={32}
                    height={32}
                    className="size-8 rounded-full object-cover"
                  />
                  <span className="hidden text-sm font-medium sm:inline-block">
                    {auth.user.full_name}
                  </span>
                </div>
              </Link>
            ) : (
              <Link href="/login" className="ms-4">
                <Button>{tAuth("submit")}</Button>
              </Link>
            ))}
        </div>
      </div>
    </header>
  );
}
