"use client";

import Loading from "@/components/loading";
import { useOrgId } from "@/hooks/use-org-id";
import { authClient } from "@/lib/auth/auth-client";
import ProtectedLayoutWrapper from "@/partials/protected-layout-wrapper";
import { useGetOrgsQuery } from "@/redux/features/orgs/org-api";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function ProtectedRootPage() {
  const router = useRouter();
  const { data: orgs, isLoading, isError } = useGetOrgsQuery();
  const { prefixedOrgId } = useOrgId(orgs || []);

  useEffect(() => {
    if (isLoading) return;
    if (prefixedOrgId) {
      router.replace(`/${prefixedOrgId}`);
    } else if (isError) {
      // Orgs API failed — session is stale/invalid. Sign out to clear the bad cookie.
      authClient.signOut().finally(() => router.replace("/login"));
    }
  }, [isLoading, isError, prefixedOrgId, router]);

  return (
    <ProtectedLayoutWrapper>
      <div className="flex min-h-svh items-center justify-center">
        <Loading />
      </div>
    </ProtectedLayoutWrapper>
  );
}
