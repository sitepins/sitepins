// Onboarding gate used by the middleware (proxy.ts). The open-source build
// has no onboarding survey, so every user counts as onboarded. The hosted
// cloud edition overrides this module (onboarding-gate.cloud.ts) with a
// persona-backed check.

export const onboardingEnabled = false;

export async function hasCompletedOnboarding(
  _userId: string,
  _cookie?: string,
): Promise<boolean> {
  return true;
}
