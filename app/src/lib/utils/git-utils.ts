import { MdxSnippet } from "@/editor/utils/plate-types";
import { GIT_COMMIT_EMAIL_DOMAIN } from "@/lib/brand";
import { isGitLabProvider } from "@/lib/utils/provider-checker";
import path from "path";
import { GITHUB_APP_NAME, GITLAB_APP_NAME } from "../constant";

/**
 * Common Git utility functions for GitHub and GitLab providers.
 */

export type UploadableFileLike = { path: string; delete?: boolean };

/**
 * Filters out system and restricted files from an upload list
 */
export function filterUploadableFiles<T extends UploadableFileLike>(
  files: T[],
): T[] {
  return files.filter((file) => {
    // Should proceed if the file is being deleted
    if (file.delete) {
      return true;
    }

    if (file.path.includes(".DS_Store") || file.path.includes("Thumbs.db")) {
      return false;
    }
    // Skip GitHub workflow files (restricted by GitHub security)
    if (file.path.startsWith(".github/workflows/")) {
      return false;
    }
    return true;
  });
}

/**
 * Matches a string against a simple glob-like pattern.
 */
export function matchPattern(str: string, pattern: string) {
  if (!pattern) return true;
  // Escape regex special characters except for * and ?
  const sanitizedPattern = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const regexPattern = sanitizedPattern
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${regexPattern}$`).test(str);
}

/**
 * Collapse duplicate paths so we don't upload the same file twice.
 */
export function dedupeFiles<T extends UploadableFileLike>(files: T[]): T[] {
  const map = new Map<string, T>();
  for (const file of files) {
    map.set(file.path, file);
  }
  return Array.from(map.values());
}

/**
 * Run async tasks with a concurrency cap.
 */
export async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let idx = 0;

  async function next(): Promise<void> {
    const current = idx++;
    if (current >= items.length) return;
    results[current] = await worker(items[current], current);
    return next();
  }

  const runners = Array.from({ length: Math.min(limit, items.length) }, () =>
    next(),
  );
  await Promise.all(runners);
  return results;
}

/**
 * Splits an array into chunks of a given size
 */
export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function defaultIsRetriable(error: any) {
  const status =
    error?.status || error?.response?.status || error?.request?.status;
  const msg = typeof error?.message === "string" ? error.message : "";
  return (
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    msg.toLowerCase().includes("fetch") ||
    msg.toLowerCase().includes("network")
  );
}

/**
 * Retries an async function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options?: {
    retries?: number;
    baseDelayMs?: number;
    isRetriable?: (error: any) => boolean;
  },
): Promise<T> {
  const retries = options?.retries ?? 2;
  const baseDelayMs = options?.baseDelayMs ?? 250;
  const isRetriable = options?.isRetriable ?? defaultIsRetriable;

  let lastErr: any;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      lastErr = e;
      if (!isRetriable(e) || attempt === retries) break;
      await new Promise((r) => setTimeout(r, baseDelayMs * (attempt + 1)));
    }
  }
  throw lastErr;
}

/**
 * Get commit author/committer details based on provider
 */
export function getGitAuthDetails(provider: "Github" | "Gitlab") {
  if (isGitLabProvider(provider)) {
    const appName = GITLAB_APP_NAME || "Sitepins";
    return {
      email: `${appName.toLowerCase().replace(/[^a-z0-9]/g, "")}@${GIT_COMMIT_EMAIL_DOMAIN}`,
      name: appName,
    };
  }

  return {
    email: `${GITHUB_APP_NAME}[bot]@users.noreply.github.com`,
    name: `${GITHUB_APP_NAME}[bot]`,
  };
}

/**
 * Normalizes snippet payload from both GitHub and GitLab formats
 */
export function normalizeSnippetPayload(
  payload: Record<string, any>,
  filePath: string,
): MdxSnippet | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  // Support new schema
  if (payload.label && (payload.code !== undefined || payload.schema)) {
    return {
      label: payload.label as string,
      code: (payload.code as string) || "",
      schema: Array.isArray(payload.schema) ? payload.schema : [],
    };
  }

  // Legacy schema support
  const source =
    typeof payload.snippet === "object" && payload.snippet !== null
      ? (payload.snippet as Record<string, any>)
      : payload;

  if (!source || typeof source !== "object") {
    return null;
  }

  const baseName = path.parse(filePath).name;
  const name =
    typeof source.name === "string" && source.name.trim().length
      ? source.name.trim()
      : baseName;

  return {
    label:
      typeof source.label === "string" && source.label.trim().length
        ? source.label.trim()
        : name,
    code: "",
    schema: Array.isArray(source.schema)
      ? source.schema
          .filter((s: any) => typeof s === "string")
          .map((s: string) => s.trim())
      : undefined,
  };
}

/**
 * Parses snippet file content
 */
export function parseSnippetFile(
  content: string,
  filePath: string,
): MdxSnippet | null {
  if (!content || !content.trim()) {
    return null;
  }

  try {
    const payload = JSON.parse(content);
    return normalizeSnippetPayload(payload, filePath);
  } catch (error) {
    console.warn(
      "Unable to parse snippet file",
      filePath,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

/**
 * Standardizes commit message with attribution
 */
export function createGitCommitMessage(
  message: string,
  description: string | undefined,
  authorName?: string,
  authorEmail?: string,
  provider: "Github" | "Gitlab" = "Github",
): string {
  const parts = [message];

  if (description) {
    parts.push(description);
  }

  if (authorName) {
    const email =
      authorEmail ||
      `${authorName.toLowerCase().replace(/\s+/g, "")}@users.noreply.${provider.toLowerCase()}.com`;
    parts.push(`Co-authored-by: ${authorName} <${email}>`);
  }

  return parts.filter(Boolean).join("\n\n");
}

/**
 * Normalizes delete commit messages
 */
export function normalizeDeleteCommitMessage(
  message: string,
  files: Array<{ path: string; delete?: boolean }>,
) {
  const allDeletes = files.length > 0 && files.every((f) => Boolean(f.delete));
  if (!allDeletes) return message;

  const trimmed = typeof message === "string" ? message.trim() : "";
  if (/^deleted\s*:/i.test(trimmed)) return message;

  if (trimmed.startsWith(":")) {
    return `deleted${trimmed}`;
  }

  const deletedPaths = files
    .filter((f) => f.delete)
    .map((f) => f.path)
    .filter(Boolean);

  if (deletedPaths.length === 1) {
    return `deleted:${deletedPaths[0]}`;
  }

  return trimmed ? `deleted: ${trimmed}` : "deleted";
}

/**
 * Add delay to avoid rate limiting
 */
export function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Checks if an error is a transient network error
 */
export function isTransientNetworkError(error: any) {
  const msg =
    typeof error?.message === "string"
      ? error.message
      : typeof error === "string"
        ? error
        : "";

  const status =
    error?.status ||
    error?.response?.status ||
    (typeof (error as any)?.error?.status === "number"
      ? (error as any).error.status
      : undefined);

  return (
    msg.toLowerCase().includes("failed to fetch") ||
    msg.toLowerCase().includes("network") ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504
  );
}

/**
 * Encoder for base64 that works in both node and browser
 */
export function toBase64(str: string): string {
  try {
    return typeof btoa === "function"
      ? btoa(unescape(encodeURIComponent(str)))
      : Buffer.from(str, "utf-8").toString("base64");
  } catch {
    return Buffer.from(str, "utf-8").toString("base64");
  }
}
