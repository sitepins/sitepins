import { logger } from "@/lib/logger";
const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "";
const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET ?? "";

export function internalHeaders(cookieHeader: string): HeadersInit {
  if (!INTERNAL_SECRET)
    throw new Error("INTERNAL_API_SECRET env var is not set");
  return {
    "Content-Type": "application/json",
    cookie: cookieHeader,
    "x-internal-secret": INTERNAL_SECRET,
  };
}

export type CachedPreview = {
  sandboxName?: string;
  commitSha?: string;
};

export async function getCachedPreview(
  projectId: string,
  cookieHeader: string,
): Promise<CachedPreview> {
  try {
    const res = await fetch(
      `${BACKEND}/project-preview/${encodeURIComponent(projectId)}`,
      { headers: internalHeaders(cookieHeader), cache: "no-store" },
    );
    if (!res.ok) return {};
    const body = await res.json();
    const result = body?.result;
    return {
      sandboxName: result?.sandbox_name || undefined,
      commitSha: result?.commit_sha || undefined,
    };
  } catch {
    return {};
  }
}

export async function syncSandboxPreviewState(
  projectId: string,
  state: { sandbox_name?: string; preview_url?: string; commit_sha?: string },
  cookieHeader: string,
): Promise<void> {
  try {
    await fetch(`${BACKEND}/project-preview/${encodeURIComponent(projectId)}`, {
      method: "PUT",
      headers: internalHeaders(cookieHeader),
      body: JSON.stringify(state),
    });
  } catch (e) {
    logger.error("[sandbox] failed to sync preview state:", e);
  }
}
