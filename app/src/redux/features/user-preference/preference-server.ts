import { API_URL, IS_DEMO } from "@/lib/constant";

/**
 * Middleware-safe fetch for user language preference.
 * Returns the stored locale code, or null on failure.
 */
export async function getUserLanguage(
  userId: string,
  cookie?: string,
): Promise<string | null> {
  try {
    const response = await fetch(`${API_URL}/user-preference/${userId}`, {
      headers: {
        "X-App-Context": IS_DEMO ? "demo" : "app",
        ...(cookie ? { cookie } : {}),
      },
      cache: "no-store",
    });

    if (!response.ok) return null;

    const body = await response.json();
    return body?.result?.language ?? body?.language ?? null;
  } catch {
    return null;
  }
}
