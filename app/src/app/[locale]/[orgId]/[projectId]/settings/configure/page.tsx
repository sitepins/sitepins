"use client";

import { useOwnerPlan } from "@/hooks/use-owner-plan";
import CommitConfigSkeleton from "./_components/commit-config-skeleton";
import CommitDialogForm from "./_components/commit-dialog-form";
import SiteConfig from "./_components/site-config-form";

export default function ConfigurePage() {
  const { canAccessPremiumFeatures, isLoading } = useOwnerPlan();

  return (
    <>
      <SiteConfig />
      {isLoading ? (
        <CommitConfigSkeleton />
      ) : (
        canAccessPremiumFeatures && <CommitDialogForm />
      )}
    </>
  );
}
