// All required; next.config.mjs fails when one is unset. Colors live in theme.css.

// Literal process.env reads only: Next inlines NEXT_PUBLIC_* by exact name.
const env = (value: string | undefined) => value?.trim() ?? "";

// "none"/"off"/"false" → "" (callers hide the link).
const link = (value: string | undefined) => {
  const v = env(value);
  return ["none", "off", "false"].includes(v.toLowerCase()) ? "" : v;
};

/** Lowercase `[a-z0-9-]`, safe for folders, cookies, storage keys, branches. */
export const toSlug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

export const BRAND_NAME = env(process.env.NEXT_PUBLIC_BRAND_NAME);
export const BRAND_SLUG = toSlug(env(process.env.NEXT_PUBLIC_BRAND_SLUG));
export const BRAND_URL = env(process.env.NEXT_PUBLIC_BRAND_URL).replace(
  /\/+$/,
  "",
);

export const TERMS_URL = env(process.env.NEXT_PUBLIC_TERMS_URL);
export const PRIVACY_URL = env(process.env.NEXT_PUBLIC_PRIVACY_URL);
export const SUPPORT_URL = env(process.env.NEXT_PUBLIC_SUPPORT_URL);
export const UPDATES_URL = link(process.env.NEXT_PUBLIC_UPDATES_URL);
export const STATUS_URL = link(process.env.NEXT_PUBLIC_STATUS_URL);
export const STATUS_API_URL = STATUS_URL ? `${STATUS_URL}/api/status.json` : "";
export const COMMUNITY_URL = link(process.env.NEXT_PUBLIC_COMMUNITY_URL);
export const DOCS_URL = link(process.env.NEXT_PUBLIC_DOCS_URL);
// AGPL §13: a modified instance offered over a network must offer its source.
export const SOURCE_URL = link(process.env.NEXT_PUBLIC_SOURCE_URL);

// Paths are under /public or absolute URLs.
export const BRAND_LOGO = env(process.env.NEXT_PUBLIC_BRAND_LOGO);
export const BRAND_LOGO_DARK = env(process.env.NEXT_PUBLIC_BRAND_LOGO_DARK);
export const BRAND_LOGO_ICON = env(process.env.NEXT_PUBLIC_BRAND_LOGO_ICON);
export const BRAND_LOGO_WIDTH = env(process.env.NEXT_PUBLIC_BRAND_LOGO_WIDTH);
export const BRAND_LOGO_HEIGHT = env(process.env.NEXT_PUBLIC_BRAND_LOGO_HEIGHT);
export const BRAND_LOGO_TEXT = BRAND_NAME;
export const BRAND_FAVICON = env(process.env.NEXT_PUBLIC_BRAND_FAVICON);

export type TBrandIcon = {
  src: string;
  sizes: string;
  purpose?: "any" | "maskable";
};

// The bundled favicon keeps its sized set. A custom one must be a square PNG of
// at least 512px; it's declared at the sizes PWA install requires.
const BUNDLED_ICONS = BRAND_FAVICON === "/images/favicon.png";

export const BRAND_APPLE_ICON = BUNDLED_ICONS
  ? "/icons/apple-touch-icon.png"
  : BRAND_FAVICON;

/** PWA manifest icons. */
export const BRAND_ICONS: TBrandIcon[] = BUNDLED_ICONS
  ? [
      { src: "/icons/icon-192x192.png", sizes: "192x192", purpose: "any" },
      { src: "/icons/icon-512x512.png", sizes: "512x512", purpose: "any" },
      {
        src: "/icons/icon-maskable-512x512.png",
        sizes: "512x512",
        purpose: "maskable",
      },
      { src: BRAND_APPLE_ICON, sizes: "180x180" },
    ]
  : [
      { src: BRAND_FAVICON, sizes: "192x192", purpose: "any" },
      { src: BRAND_FAVICON, sizes: "512x512", purpose: "any" },
      { src: BRAND_FAVICON, sizes: "512x512", purpose: "maskable" },
    ];

/** Domain of the git commit author email for the CMS app. */
export const GIT_COMMIT_EMAIL_DOMAIN = (() => {
  try {
    return new URL(BRAND_URL).host;
  } catch {
    return "";
  }
})();

// Identifiers derived from the slug.

/** Repo folder holding config.json, schema/ and snippet/. */
export const CONFIG_DIR = `.${BRAND_SLUG}`;

/** `Sitepins` → `Sitepins-User:` commit trailers. */
export const COMMIT_TRAILER_PREFIX =
  BRAND_SLUG.charAt(0).toUpperCase() + BRAND_SLUG.slice(1);

/** Prefix for localStorage keys, IndexedDB and service-worker caches. */
export const STORAGE_PREFIX = BRAND_SLUG;

/** Prefix for avatar/logo uploads in the media bucket (`<prefix>/users/…`). */
export const UPLOAD_PREFIX = BRAND_SLUG;

export type TUploadFolder = `${string}/${"users" | "orgs" | "sites"}`;

export const uploadFolder = (kind: "users" | "orgs" | "sites"): TUploadFolder =>
  `${UPLOAD_PREFIX}/${kind}`;
