import { MdxSnippet } from "@/editor/utils/plate-types";
import { BRAND_NAME, GIT_COMMIT_EMAIL_DOMAIN } from "@/lib/brand";
import { logger } from "@/lib/logger";
import { isGitLabProvider, TGitProvider } from "@/lib/utils/provider-checker";
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

/** Field readers for caught values, which TypeScript types as `unknown`. */
const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;

const statusOf = (error: unknown): unknown => {
  const err = asRecord(error);
  return (
    err?.status ??
    asRecord(err?.response)?.status ??
    asRecord(err?.request)?.status
  );
};

const messageOf = (error: unknown): string => {
  const msg = asRecord(error)?.message;
  if (typeof msg === "string") return msg;
  return typeof error === "string" ? error : "";
};

function defaultIsRetriable(error: unknown) {
  const status = statusOf(error);
  const msg = messageOf(error);
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
    isRetriable?: (error: unknown) => boolean;
  },
): Promise<T> {
  const retries = options?.retries ?? 2;
  const baseDelayMs = options?.baseDelayMs ?? 250;
  const isRetriable = options?.isRetriable ?? defaultIsRetriable;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (e) {
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
export function getGitAuthDetails(provider: TGitProvider) {
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
  payload: Record<string, unknown>,
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
      ? (payload.snippet as Record<string, unknown>)
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
          .filter((s: unknown) => typeof s === "string")
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
    logger.warn("Unable to parse snippet file", error, { filePath });
    return null;
  }
}

/** Trailer key crediting a CMS user by name; trailer keys can't contain spaces. */
export const USER_TRAILER_KEY = `${BRAND_NAME.replace(/[^A-Za-z0-9]+/g, "-")}-User`;

/**
 * Standardizes commit message with attribution
 */
export function createGitCommitMessage(
  message: string,
  description?: string,
  trailer?: string,
): string {
  return [message, description, trailer].filter(Boolean).join("\n\n");
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
export function isTransientNetworkError(error: unknown) {
  const msg = messageOf(error);

  const status = statusOf(error) ?? asRecord(asRecord(error)?.error)?.status;

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

export function fromBase64(str: string): string {
  return Buffer.from(str, "base64").toString("utf-8");
}

function sha1Hex(bytes: Uint8Array): string {
  const total = Math.ceil((bytes.length + 9) / 64) * 64;
  const buf = new Uint8Array(total);
  buf.set(bytes);
  buf[bytes.length] = 0x80;
  const view = new DataView(buf.buffer);
  const bits = bytes.length * 8;
  view.setUint32(total - 8, Math.floor(bits / 2 ** 32));
  view.setUint32(total - 4, bits >>> 0);

  const h = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];
  const w = new Uint32Array(80);
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 80; i++) {
      const x = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16];
      w[i] = (x << 1) | (x >>> 31);
    }
    let [a, b, c, d, e] = h;
    for (let i = 0; i < 80; i++) {
      const f =
        i < 20
          ? ((b & c) | (~b & d)) + 0x5a827999
          : i < 40
            ? (b ^ c ^ d) + 0x6ed9eba1
            : i < 60
              ? ((b & c) | (b & d) | (c & d)) + 0x8f1bbcdc
              : (b ^ c ^ d) + 0xca62c1d6;
      const t = (((a << 5) | (a >>> 27)) + f + e + w[i]) >>> 0;
      e = d;
      d = c;
      c = ((b << 30) | (b >>> 2)) >>> 0;
      b = a;
      a = t;
    }
    h[0] = (h[0] + a) >>> 0;
    h[1] = (h[1] + b) >>> 0;
    h[2] = (h[2] + c) >>> 0;
    h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0;
  }
  return h.map((x) => x.toString(16).padStart(8, "0")).join("");
}

/**
 * Same id `git hash-object` gives the UTF-8 encoding of `content`. Pure JS
 * because `crypto.subtle` is missing on plain-HTTP self-hosted origins.
 */
export function gitBlobSha(content: string): string {
  const body = new TextEncoder().encode(content);
  const header = new TextEncoder().encode(`blob ${body.length}\0`);
  const bytes = new Uint8Array(header.length + body.length);
  bytes.set(header);
  bytes.set(body, header.length);
  return sha1Hex(bytes);
}
