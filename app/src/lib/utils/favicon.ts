// Same-origin favicon helpers (proxied via /api/favicon to avoid gstatic CORS).

// Add https:// when missing.
export function normalizeSiteUrl(siteUrl?: string | null): string {
  if (!siteUrl) return "";
  return siteUrl.startsWith("http") ? siteUrl : `https://${siteUrl}`;
}

// Proxied favicon URL, or "" when no site.
export function getFaviconUrl(siteUrl?: string | null, size = 64): string {
  const normalized = normalizeSiteUrl(siteUrl);
  if (!normalized) return "";
  return `/api/favicon?url=${encodeURIComponent(normalized)}&size=${size}`;
}
