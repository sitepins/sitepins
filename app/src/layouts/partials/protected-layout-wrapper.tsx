"use client";

import Loading from "@/app/[locale]/loading";
import { useHydrated } from "@/hooks/use-hydrated";
import { authClient } from "@/lib/auth/auth-client";
import { usePlanBootstrap } from "@/redux/features/plan/slice";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function ProtectedLayoutWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: auth, isPending, error: _error } = authClient.useSession();
  const isAuthenticated = !!auth;
  const router = useRouter();
  const hasHydrated = useHydrated();

  // Redirect unauthenticated users to login, keeping the current deep link
  useEffect(() => {
    if (!isPending && !auth) {
      const from = `${window.location.pathname}${window.location.search}`;
      router.replace(`/login?from=${encodeURIComponent(from)}`);
    }
  }, [auth, isPending, router]);

  usePlanBootstrap({
    userId: auth?.user.user_id,
    enabled: isAuthenticated,
  });

  if (!hasHydrated || isPending || !auth) {
    return <Loading />;
  }

  return <>{children}</>;
}
