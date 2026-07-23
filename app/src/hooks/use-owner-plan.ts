import { authClient } from "@/lib/auth/auth-client";
import config from "@/lib/config";
import { EPackage } from "@/lib/plan/types";
import { useGetOrgQuery } from "@/redux/features/orgs/org-api";
import { selectCurrentPackage } from "@/redux/features/plan/slice";
import { useGetProjectQuery } from "@/redux/features/project/project-api";
import { useAppSelector } from "@/redux/store";
import { useParams } from "next/navigation";

type Params = {
  projectId?: string;
  orgId?: string;
};

export function useOwnerPlan() {
  const { data: auth, isPending: isAuthLoading } = authClient.useSession();
  const { projectId, orgId } = useParams<Params>();

  const safeProjectId = projectId ?? "";
  const safeOrgId = orgId
    ? orgId.startsWith("org-")
      ? orgId.slice(4)
      : orgId
    : "";

  // Fetching current org data
  const { data: org, isLoading: isOrgLoading } = useGetOrgQuery(safeOrgId, {
    skip: !safeOrgId,
  });

  // Checking if any org owners has paid plan in org
  const orgOwnerData = Array.isArray(org?.ownerData) ? org?.ownerData : [];

  const orgHasPaidPlan = orgOwnerData.some(
    (item) => item?.active_package?.toLowerCase() !== EPackage.HOBBY,
  );

  const { data: project, isLoading: isProjectLoading } = useGetProjectQuery(
    { projectId: safeProjectId, orgId: safeOrgId },
    { skip: !safeProjectId || !safeOrgId },
  );

  const { currentPackage, isPending: isPackagePending } =
    useAppSelector(selectCurrentPackage);
  const isFreeUser = currentPackage === EPackage.HOBBY;

  const ownerPackage = project?.ownerData?.[0]?.active_package;

  const ownerHasPaidPlan =
    (ownerPackage?.toLowerCase() as EPackage) !== EPackage.HOBBY &&
    !!ownerPackage;

  // Trial logic
  const trialEnabled = Boolean(config?.trial?.free_trial ?? true);
  const trialDaysTotal = Number(config?.trial?.days ?? 0);

  const sessionCreatedAt = auth?.user?.createdAt;

  let trialStartedAt: Date | null = null;
  let trialEndsAt: Date | null = null;
  let trialDaysRemaining = 0;
  let isOnTrial = false;
  let isTrialExpired = false;

  if (trialEnabled && sessionCreatedAt) {
    const start = new Date(sessionCreatedAt);
    if (!isNaN(start.getTime())) {
      trialStartedAt = start;
      trialEndsAt = new Date(
        start.getTime() + trialDaysTotal * 24 * 60 * 60 * 1000,
      );
      // Use server time from auth.session.serverTime when available to avoid client clock tampering
      const serverTimeIso = auth?.session?.serverTime;
      const now = serverTimeIso ? new Date(serverTimeIso) : new Date();
      const remainingMs = trialEndsAt.getTime() - now.getTime();
      trialDaysRemaining = Math.max(
        0,
        Math.ceil(remainingMs / (24 * 60 * 60 * 1000)),
      );
      isOnTrial = remainingMs > 0;
      isTrialExpired = remainingMs <= 0;
    }
  }

  const canAccessProFeatures =
    !isFreeUser || ownerHasPaidPlan || orgHasPaidPlan || isOnTrial;

  const isTeamTierOrHigher = (pkg?: string | null) =>
    !!pkg &&
    [EPackage.TEAM, EPackage.ENTERPRISE].includes(
      pkg.toLowerCase() as EPackage,
    );

  const canAccessProPlusFeatures =
    isTeamTierOrHigher(currentPackage) ||
    isTeamTierOrHigher(ownerPackage) ||
    orgOwnerData.some((item) => isTeamTierOrHigher(item?.active_package));

  return {
    orgHasPaidPlan,
    ownerHasPaidPlan,
    isFreeUser,
    canAccessProFeatures,
    canAccessProPlusFeatures,
    currentPackage,
    ownerPackage,
    project,
    isLoading:
      isOrgLoading || isProjectLoading || isAuthLoading || isPackagePending,
    trial: {
      daysTotal: trialDaysTotal,
      startedAt: trialStartedAt,
      endsAt: trialEndsAt,
      daysRemaining: trialDaysRemaining,
      isOnTrial,
      isExpired: isTrialExpired,
    },
  };
}
