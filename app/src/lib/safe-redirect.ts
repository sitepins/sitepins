// Guards post-login `?from=` values against open redirects.
// Shared by the middleware (proxy.ts) and the client auth screens.

const FALLBACK = "/";

/**
 * Returns `from` when it is a same-app path, otherwise "/".
 *
 * Only a path is accepted — absolute URLs, protocol-relative "//evil.com" and
 * backslash variants ("/\evil.com", which some browsers normalise to "//") all
 * fall back. `from` is always produced as `pathname + search`, so nothing
 * legitimate is rejected.
 */
export function safeInternalPath(from: string | null | undefined): string {
  if (!from || !from.startsWith("/")) return FALLBACK;
  if (from.startsWith("//") || from.startsWith("/\\")) return FALLBACK;
  return from;
}
