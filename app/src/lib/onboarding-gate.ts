// Onboarding gate used by the middleware (proxy.ts). There is no onboarding
// survey, so every user counts as onboarded.

export const onboardingEnabled = false;

export async function hasCompletedOnboarding(
  _userId: string,
  _cookie?: string,
): Promise<boolean> {
  return true;
}
