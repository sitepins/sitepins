import { NextRequest } from "next/server";

// Same-origin favicon proxy: fetch gstatic server-side, stream back.
// Keeps favicon requests same-origin so session-replay tools don't hit CORS.
// Upstream host is fixed to gstatic (not from user input) — no SSRF.

const GSTATIC_FAVICON = "https://t1.gstatic.com/faviconV2";
const DEFAULT_SIZE = 64;
const MAX_SIZE = 256;

// 1x1 transparent PNG fallback when the lookup fails.
const TRANSPARENT_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

function transparentResponse(status = 200): Response {
  return new Response(new Uint8Array(TRANSPARENT_PNG), {
    status,
    headers: {
      "Content-Type": "image/png",
      // Short cache so transient failures aren't pinned.
      "Cache-Control": "public, max-age=300",
    },
  });
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const url = searchParams.get("url");

  if (!url || !/^https?:\/\//i.test(url)) {
    return transparentResponse(200);
  }

  const sizeParam = Number(searchParams.get("size"));
  const size =
    Number.isFinite(sizeParam) && sizeParam > 0
      ? Math.min(Math.floor(sizeParam), MAX_SIZE)
      : DEFAULT_SIZE;

  const upstream = `${GSTATIC_FAVICON}?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(
    url,
  )}&size=${size}`;

  try {
    const res = await fetch(upstream, {
      next: { revalidate: 60 * 60 * 24 }, // 24h server cache
    });

    if (!res.ok || !res.body) {
      // 404 (not 200) so the <img> fires onError and the client falls back
      // to the initials avatar instead of rendering an invisible pixel.
      return transparentResponse(404);
    }

    const contentType = res.headers.get("content-type") ?? "image/png";

    return new Response(res.body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        // 24h browser cache + 7d SWR.
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    });
  } catch {
    return transparentResponse(404);
  }
}
