// Every feature is available. Keep the shape stable: other builds may swap
// this module for their own.
export function useFeatureAccess() {
  return {
    hasAdvancedFeatures: true,
    hasTeamFeatures: true,
    isLoading: false,
  };
}
