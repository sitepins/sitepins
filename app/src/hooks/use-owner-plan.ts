// Self-hosted installs are unmetered and have no plans, so every capability
// is granted. The hosted cloud edition overrides this module
// (use-owner-plan.cloud.ts) with the real plan- and trial-aware version.
//
// Shape is kept identical across editions so consumers never branch on which
// build they're in.
export function useOwnerPlan() {
  return {
    orgHasPaidPlan: true,
    ownerHasPaidPlan: true,
    isFreeUser: false,
    canAccessProFeatures: true,
    canAccessProPlusFeatures: true,
    currentPackage: null,
    ownerPackage: null,
    project: undefined,
    isLoading: false,
    trial: {
      daysTotal: 0,
      startedAt: null as Date | null,
      endsAt: null as Date | null,
      daysRemaining: 0,
      isOnTrial: false,
      isExpired: false,
    },
  };
}
