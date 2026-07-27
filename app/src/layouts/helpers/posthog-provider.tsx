"use client";

// Analytics are not part of the open-source build. The hosted cloud edition
// overrides this module (posthog-provider.cloud.tsx) with the real PostHog
// provider.
export default function PostHogProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
