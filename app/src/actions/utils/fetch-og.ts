"use server";

// ─── Constants ────────────────────────────────────────────────────────────────

const FETCH_TIMEOUT_MS = 5000;
const MAX_HTML_BYTES = 500_000; // 500KB — enough to cover any <head>

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

function normalizeUrl(raw: string): URL {
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const parsed = new URL(withScheme); // throws on invalid input

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only http/https URLs are supported");
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
      let imageUrl = match[1]
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

type OgImageResult =
  | { success: true; url: string }
  | { success: false; error: string };

export async function fetchOgImageAction(
  rawUrl: string,
): Promise<OgImageResult> {
  // 1. Validate & normalise the URL
  let parsedUrl: URL;
  try {
    parsedUrl = normalizeUrl(rawUrl);
  } catch {
    return { success: false, error: "Invalid URL provided" };
  }

  try {
    // 2. Fetch with timeout + browser-like headers
    const res = await fetch(parsedUrl.href, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      next: { revalidate: 3600 },
    });

    if (!res.ok) {
      return {
        success: false,
        error: `Target URL returned ${res.status} ${res.statusText}`,
      };
    }

    // 3. Bail out early if the response isn't HTML
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) {
      return {
        success: false,
        error: `Expected HTML but got "${contentType}"`,
      };
    }

    // 4. Read only the <head> portion of the document
    const html = await readHead(res);

    // 5. Extract the OG image URL
    const imageUrl = extractImageUrl(html, parsedUrl);

    if (imageUrl) {
      return { success: true, url: imageUrl };
    }

    return { success: false, error: "No open graph image found" };
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      return { success: false, error: "Request timed out after 5 seconds" };
    }

    console.error("[fetchOgImageAction]", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to fetch OG image",
    };
  }
}
