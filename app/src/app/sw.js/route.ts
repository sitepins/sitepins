import { APP_VERSION } from "@/lib/version";

export const dynamic = "force-static";
export const revalidate = false;

function buildServiceWorkerScript(version: string) {
  return `// Sitepins PWA Service Worker
const SW_VERSION = "sitepins-v${version}";
const CACHE_STATIC_NAME = \`sitepins-static-\${SW_VERSION}\`;
const CACHE_RUNTIME_NAME = \`sitepins-runtime-\${SW_VERSION}\`;
const CACHE_OFFLINE_NAME = \`sitepins-offline-\${SW_VERSION}\`;

const PRECACHE_RESOURCES = [
  "/offline.html",
  "/images/logo-icon.svg",
  "/images/logo.svg",
  "/images/logo-white.svg",
  "/images/favicon.png",
  "/icons/icon-192x192.png",
  "/icons/icon-512x512.png",
  "/icons/icon-maskable-512x512.png",
  "/icons/apple-touch-icon.png",
  "/icons/favicon-32x32.png",
  "/icons/favicon-16x16.png",
];

// Fallback HTML template if cache is ever empty
const OFFLINE_FALLBACK_HTML = \`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Offline — Sitepins</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #090d16; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 1.5rem; text-align: center; }
    .card { max-width: 420px; width: 100%; background: #0f172a; border: 1px solid #1e293b; border-radius: 1.25rem; padding: 2.5rem 2rem; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5); }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
    p { color: #94a3b8; font-size: 0.925rem; line-height: 1.5; margin-bottom: 1.5rem; }
    button { background: #5d5fe5; color: #ffffff; border: none; padding: 0.75rem 1.5rem; font-size: 0.925rem; font-weight: 600; border-radius: 0.75rem; cursor: pointer; width: 100%; }
  </style>
</head>
<body>
  <div class="card">
    <h1>You are offline</h1>
    <p>Sitepins requires an active network connection. Reconnect to restore your workspace.</p>
    <button onclick="window.history.length > 1 ? window.history.back() : (window.location.href = '/')">Retry Connection</button>
  </div>
</body>
</html>\`;

// Install event — immediately activate and precache
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_OFFLINE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_RESOURCES).catch(() => {
        // Silently continue if some optional asset fails in dev
      });
    }),
  );
});

// Activate event — clean up older caches and claim clients immediately
self.addEventListener("activate", (event) => {
  const currentCaches = [
    CACHE_STATIC_NAME,
    CACHE_RUNTIME_NAME,
    CACHE_OFFLINE_NAME,
  ];
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (
              cacheName.startsWith("sitepins-") &&
              !currentCaches.includes(cacheName)
            ) {
              return caches.delete(cacheName);
            }
          }),
        );
      })
      .then(() => self.clients.claim()),
  );
});

// Message listener — handle skipWaiting on user action
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// Network-first helper for navigation (only fall back to offline page if truly offline)
async function handleNavigation(request) {
  // If browser reports offline, return offline fallback immediately
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    const cachedPage = await caches.match(request);
    if (cachedPage) return cachedPage;

    const offlinePage = await caches.match("/offline.html");
    if (offlinePage) return offlinePage;

    return new Response(OFFLINE_FALLBACK_HTML, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  try {
    const networkResponse = await fetch(request);
    return networkResponse;
  } catch (error) {
    const cachedPage = await caches.match(request);
    if (cachedPage) return cachedPage;

    const offlinePage = await caches.match("/offline.html");
    if (offlinePage) return offlinePage;

    return new Response(OFFLINE_FALLBACK_HTML, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
}

// Stale-While-Revalidate helper for static assets
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);

  const fetchPromise = fetch(request)
    .then((networkResponse) => {
      if (networkResponse && networkResponse.status === 200) {
        cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    })
    .catch(() => cachedResponse);

  return cachedResponse || fetchPromise;
}

// Fetch event
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignore non-http(s) schemes (e.g. chrome-extension, data)
  if (!url.protocol.startsWith("http")) {
    return;
  }

  // Bypass all cross-origin requests (GitHub, GitLab, backend APIs, etc.)
  if (url.origin !== self.location.origin) {
    return;
  }

  // Only handle GET requests below
  if (request.method !== "GET") {
    return;
  }

  // Skip Dev HMR / hot-reload endpoints
  if (
    url.pathname.includes("webpack-hmr") ||
    url.pathname.includes("turbopack_hmr") ||
    url.pathname.includes(".hot-update.")
  ) {
    return;
  }

  // Network-only for API, auth, provider, and web socket handshakes
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/auth/") ||
    url.pathname.startsWith("/provider/") ||
    url.pathname.includes("/socket.io/")
  ) {
    return;
  }

  // Next.js RSC requests (React Server Components)
  const isRsc =
    request.headers.get("RSC") === "1" ||
    request.headers.get("Next-Router-State-Tree") ||
    url.searchParams.has("_rsc");

  if (isRsc) {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      event.respondWith(
        new Response("Offline", {
          status: 503,
          statusText: "Offline",
          headers: { "X-Next-Offline": "1" },
        }),
      );
      return;
    }

    event.respondWith(
      fetch(request).catch(() => {
        return new Response("Offline", {
          status: 503,
          statusText: "Offline",
          headers: { "X-Next-Offline": "1" },
        });
      }),
    );
    return;
  }

  // HTML page navigation: Full document navigation
  if (
    request.mode === "navigate" ||
    (request.headers.get("accept") &&
      request.headers.get("accept").includes("text/html"))
  ) {
    event.respondWith(handleNavigation(request));
    return;
  }

  // Next.js static files and cached images/icons/fonts: Stale-While-Revalidate
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/images/") ||
    url.pathname.startsWith("/icons/")
  ) {
    event.respondWith(staleWhileRevalidate(request, CACHE_STATIC_NAME));
    return;
  }

  // Default: Network fetch
  event.respondWith(fetch(request));
});
`;
}

export function GET() {
  const content = buildServiceWorkerScript(APP_VERSION);

  return new Response(content, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Service-Worker-Allowed": "/",
    },
  });
}
