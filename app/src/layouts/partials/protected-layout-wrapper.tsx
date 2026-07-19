"use client";

import Loading from "@/app/[locale]/loading";
import { authClient } from "@/lib/auth/auth-client";
import { usePlanBootstrap } from "@/redux/features/plan/slice";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function ProtectedLayoutWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: auth, isPending, error } = authClient.useSession();
  const isAuthenticated = !!auth;
  const router = useRouter();
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  // Redirect unauthenticated users to login
  useEffect(() => {
    if (!isPending && !auth) {
      router.replace("/login");
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
