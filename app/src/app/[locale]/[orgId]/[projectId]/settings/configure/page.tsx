"use client";

import { useFeatureAccess } from "@/hooks/use-feature-access";
import CommitConfigSkeleton from "./_components/commit-config-skeleton";
import CommitDialogForm from "./_components/commit-dialog-form";
import SiteConfig from "./_components/site-config-form";

export default function ConfigurePage() {
  const { hasAdvancedFeatures, isLoading } = useFeatureAccess();

  return (
    <>
      <SiteConfig />
      {isLoading ? (
        <CommitConfigSkeleton />
      ) : (
        hasAdvancedFeatures && <CommitDialogForm />
      )}
    </>
  );
}
