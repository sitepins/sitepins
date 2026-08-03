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

/**
 * Confirms the session behind `cookieHeader` may act on this project.
 *
 * The preview-state calls below authenticate with INTERNAL_API_SECRET, which
 * deliberately bypasses per-user checks — so without this a signed-in user
 * could pass any `spProjectId` and read or clobber another tenant's sandbox.
 * Deliberately does NOT send the internal secret: the org membership check
 * has to run.
 */
export async function canAccessProject(
  projectId: string,
  cookieHeader: string,
): Promise<boolean> {
  try {
    const res = await fetch(
      `${BACKEND}/project/${encodeURIComponent(projectId)}`,
      {
        headers: { "Content-Type": "application/json", cookie: cookieHeader },
        cache: "no-store",
      },
    );
    return res.ok;
  } catch {
    return false;
  }
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
