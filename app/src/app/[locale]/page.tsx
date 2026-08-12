"use client";

import Loading from "@/components/loading";
import { useOrgId } from "@/hooks/use-org-id";
import { authClient } from "@/lib/auth/auth-client";
import { onboardingEnabled } from "@/lib/onboarding-gate";
import ProtectedLayoutWrapper from "@/partials/protected-layout-wrapper";
import {
  useEnsureDefaultOrgMutation,
  useGetOrgsQuery,
} from "@/redux/features/orgs/org-api";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

const ensureRetryDelays = [1_000, 3_000, 8_000, 15_000, 30_000];

export default function ProtectedRootPage() {
  const router = useRouter();
  const { data: orgs, isLoading, isError } = useGetOrgsQuery();
  const [ensureDefaultOrg] = useEnsureDefaultOrgMutation();
  const { prefixedOrgId } = useOrgId(orgs || []);
  const retryAttempt = useRef(0);

  useEffect(() => {
    if (isLoading) return;
    if (prefixedOrgId) {
      router.replace(`/${prefixedOrgId}`);
    } else if (isError) {
      // Orgs API failed — session is stale/invalid. Sign out to clear the bad cookie.
      authClient.signOut().finally(() => router.replace("/login"));
    } else if (orgs && orgs.length === 0 && onboardingEnabled) {
      router.replace("/onboarding");
    }
  }, [isLoading, isError, prefixedOrgId, orgs, router]);

  useEffect(() => {
    if (
      isLoading ||
      isError ||
      onboardingEnabled ||
      prefixedOrgId ||
      !orgs ||
      orgs.length > 0
    ) {
      return;
    }

    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const ensureDefaultOrgWithRetry = async () => {
      try {
        await ensureDefaultOrg().unwrap();
        retryAttempt.current = 0;
      } catch {
        if (cancelled) return;

        const delay =
          ensureRetryDelays[
            Math.min(retryAttempt.current, ensureRetryDelays.length - 1)
          ];
        retryAttempt.current += 1;
        timeout = setTimeout(ensureDefaultOrgWithRetry, delay);
      }
    };

    ensureDefaultOrgWithRetry();

    return () => {
      cancelled = true;
      if (timeout) clearTimeout(timeout);
    };
  }, [ensureDefaultOrg, isError, isLoading, orgs, prefixedOrgId]);

  return (
    <ProtectedLayoutWrapper>
      <div className="flex min-h-svh items-center justify-center">
        <Loading />
      </div>
    </ProtectedLayoutWrapper>
  );
}
