/**
 * Checks if a given URL matches a demo or restricted domain pattern.
 * These URLs should not be marked as "complete" deployment steps
 * and should not be automatically populated as the project site URL.
 *
 * @param url The URL to check
 * @returns true if the URL matches a restricted pattern (demo/github)
 */
export const isDemoUrl = (url?: string | null): boolean => {
  if (!url) return false;

  const restrictedPatterns = [
    "github.com",
    "statichunt.com/demo",
    "statichunt.com/themes",
    "zeon.studio/preview",
  ];

  return restrictedPatterns.some((pattern) => url.includes(pattern));
};
