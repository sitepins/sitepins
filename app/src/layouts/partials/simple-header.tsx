"use client";

import Avatar from "@/components/avatar";
import Logo from "@/components/logo";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function SimpleHeader({ auth }: { auth?: any }) {
  const tCommon = useTranslations("common");
  const tAuth = useTranslations("auth.login");
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  return (
    <header className="py-3">
      <div className="container">
        <div className="flex w-full items-center justify-between">
          <Logo />

          {hasMounted &&
            (auth?.user ? (
              <Link href="/dashboard/account" className="ml-4">
                <div className="flex items-center space-x-3">
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
              <Link href="/login" className="ml-4">
                <Button>{tAuth("submit")}</Button>
              </Link>
            ))}
        </div>
      </div>
    </header>
  );
}
