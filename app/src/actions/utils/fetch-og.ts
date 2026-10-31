"use server";
import { logger } from "@/lib/logger";
import dns from "node:dns/promises";
import net from "node:net";

// ─── Constants ────────────────────────────────────────────────────────────────

const FETCH_TIMEOUT_MS = 5000;
const MAX_HTML_BYTES = 500_000; // 500KB — enough to cover any <head>
const MAX_REDIRECTS = 3;

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

// ─── Regex Patterns ───────────────────────────────────────────────────────────

const OG_PROPS = "og:image|og:image:url|og:image:secure_url|twitter:image";

// <meta property="og:image" content="..." />  — both attribute orderings
const RE_META_PROP_FIRST = new RegExp(
  `<meta[^>]+(?:property|name)=["'](?:${OG_PROPS})["'][^>]*content=["']([^"']+)["']`,
  "i",
);
const RE_META_CONTENT_FIRST = new RegExp(
  `<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["'](?:${OG_PROPS})["']`,
  "i",
);

// <link rel="image_src" href="..." />
const RE_LINK_IMAGE_SRC =
  /<link[^>]+rel=["']image_src["'][^>]*href=["']([^"']+)["']/i;

// <meta itemprop="image" content="..." />
const RE_ITEMPROP =
  /<meta[^>]+itemprop=["']image["'][^>]*content=["']([^"']+)["']/i;

// Next.js / SSR JSON blobs where meta tags are serialised as escaped JSON.
// Handles both key orderings and optional backslash-escaping of quotes.
const RE_JSON_PROP_FIRST = new RegExp(
  `(?:\\\\?["'])(?:property|name)(?:\\\\?["'])\\s*:\\s*(?:\\\\?["'])(?:${OG_PROPS})(?:\\\\?["'])\\s*,\\s*(?:\\\\?["'])content(?:\\\\?["'])\\s*:\\s*(?:\\\\?["'])([^"\\\\]+)(?:\\\\?["'])`,
  "i",
);
const RE_JSON_CONTENT_FIRST = new RegExp(
  `(?:\\\\?["'])content(?:\\\\?["'])\\s*:\\s*(?:\\\\?["'])([^"\\\\]+)(?:\\\\?["'])\\s*,\\s*(?:\\\\?["'])(?:property|name)(?:\\\\?["'])\\s*:\\s*(?:\\\\?["'])(?:${OG_PROPS})(?:\\\\?["'])`,
  "i",
);

// Ordered by specificity — stop at first match
const PATTERNS = [
  RE_META_PROP_FIRST,
  RE_META_CONTENT_FIRST,
  RE_LINK_IMAGE_SRC,
  RE_ITEMPROP,
  RE_JSON_PROP_FIRST,
  RE_JSON_CONTENT_FIRST,
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isPrivateOrReservedIp(ip: string): boolean {
  let targetIp = ip.trim();
  if (targetIp.startsWith("::ffff:")) {
    targetIp = targetIp.substring(7);
  }

  if (net.isIPv4(targetIp)) {
    const parts = targetIp.split(".").map(Number);
    if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
      return true;
    }
    if (parts[0] === 0) return true;
    if (parts[0] === 10) return true;
    if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;
    if (parts[0] === 127) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (
      parts[0] === 192 &&
      parts[1] === 0 &&
      (parts[2] === 0 || parts[2] === 2)
    )
      return true;
    if (parts[0] === 192 && parts[1] === 88 && parts[2] === 99) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (
      parts[0] === 198 &&
      (parts[1] === 18 || parts[1] === 19 || parts[1] === 51)
    )
      return true;
    if (parts[0] === 203 && parts[1] === 0 && parts[2] === 113) return true;
    if (parts[0] >= 224) return true;
    return false;
  }

  if (net.isIPv6(targetIp)) {
    const norm = targetIp.toLowerCase();
    if (norm === "::" || norm === "::1") return true;
    if (norm.startsWith("fc") || norm.startsWith("fd")) return true;
    if (
      norm.startsWith("fe8") ||
      norm.startsWith("fe9") ||
      norm.startsWith("fea") ||
      norm.startsWith("feb")
    )
      return true;
    if (norm.startsWith("ff")) return true;
    if (norm.startsWith("100:") || norm.startsWith("2001:db8:")) return true;
    return false;
  }

  return true;
}

function isForbiddenHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase().trim();
  if (!lower) return true;
  if (
    lower === "localhost" ||
    lower.endsWith(".localhost") ||
    lower.endsWith(".local") ||
    lower.endsWith(".internal") ||
    lower.endsWith(".lan") ||
    lower === "instance-data"
  ) {
    return true;
  }
  return false;
}

export async function validateDestinationSafety(url: URL): Promise<boolean> {
  const hostname = url.hostname;
  if (isForbiddenHostname(hostname)) return false;

  if (net.isIP(hostname)) {
    return !isPrivateOrReservedIp(hostname);
  }

  try {
    const records = await dns.lookup(hostname, { all: true });
    if (!records || records.length === 0) return false;
    for (const record of records) {
      if (isPrivateOrReservedIp(record.address)) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

function normalizeUrl(raw: string): URL {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("Empty URL");

  const withScheme = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  const parsed = new URL(withScheme);

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only http/https URLs are supported");
  }

  if (parsed.username || parsed.password) {
    throw new Error("Credentials in URL are not supported");
  }

  return parsed;
}

/** Stream the response body and stop reading once </head> is seen or the byte
 *  cap is reached. Avoids loading multi-MB HTML bodies into memory. */
async function readHead(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return await res.text();

  const decoder = new TextDecoder();
  let html = "";
  let bytesRead = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (value) {
      html += decoder.decode(value, { stream: !done });
      bytesRead += value.byteLength;
    }
    if (done || html.includes("</head>") || bytesRead >= MAX_HTML_BYTES) {
      reader.cancel().catch(() => {});
      break;
    }
  }

  return html;
}

function extractImageUrl(html: string, baseUrl: URL): string | null {
  for (const pattern of PATTERNS) {
    const match = html.match(pattern);
    if (match?.[1]) {
      const imageUrl = match[1]
        .replace(/&amp;/g, "&") // decode HTML entities
        .replace(/&#x2F;/gi, "/") // decode forward-slash entity
        .trim();

      try {
        // Resolves relative URLs; passes absolute URLs through unchanged
        return new URL(imageUrl, baseUrl).href;
      } catch {
        // Malformed URL — keep trying other patterns
      }
    }
  }

  return null;
}

// ─── Server Action ────────────────────────────────────────────────────────────

export type TOgImageResult =
  { success: true; url: string } | { success: false; error: string };

export async function fetchOgImageAction(
  rawUrl: string,
): Promise<TOgImageResult> {
  let parsedUrl: URL;
  try {
    parsedUrl = normalizeUrl(rawUrl);
  } catch {
    return { success: false, error: "Invalid URL provided" };
  }

  try {
    let currentUrl = parsedUrl;
    let res: Response | null = null;

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const isSafe = await validateDestinationSafety(currentUrl);
      if (!isSafe) {
        return { success: false, error: "Target address is not permitted" };
      }

      res = await fetch(currentUrl.href, {
        headers: BROWSER_HEADERS,
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        redirect: "manual",
        next: { revalidate: 3600 },
      });

      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const location = res.headers.get("location");
        if (!location) {
          return { success: false, error: "Redirect location missing" };
        }
        try {
          currentUrl = new URL(location, currentUrl);
          if (!["http:", "https:"].includes(currentUrl.protocol)) {
            return { success: false, error: "Invalid redirect protocol" };
          }
        } catch {
          return { success: false, error: "Invalid redirect URL" };
        }
        continue;
      }

      break;
    }

    if (!res || !res.ok) {
      return {
        success: false,
        error: "Target URL did not return a successful response",
      };
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("text/html")) {
      return {
        success: false,
        error: "Target URL did not return HTML content",
      };
    }

    const html = await readHead(res);
    const imageUrl = extractImageUrl(html, currentUrl);

    if (imageUrl) {
      return { success: true, url: imageUrl };
    }

    return { success: false, error: "No open graph image found" };
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      return { success: false, error: "Request timed out after 5 seconds" };
    }

    logger.error("[fetchOgImageAction]", error);
    return {
      success: false,
      error: "Failed to fetch open graph image",
    };
  }
}
