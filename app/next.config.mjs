import createNextIntlPlugin from "next-intl/plugin";
import fs from "node:fs";
import path from "node:path";

const withNextIntl = createNextIntlPlugin("./src/lib/i18n/request.ts");

const packageJson = JSON.parse(
  fs.readFileSync(new URL("./package.json", import.meta.url), "utf8"),
);

const OVERLAY_URL = new URL("./next.config.overlay.mjs", import.meta.url);

async function loadOverlay() {
  if (!fs.existsSync(OVERLAY_URL)) return {};
  return (await import(OVERLAY_URL.href)).default ?? {};
}

function getOrigin(url) {
  if (!url) return "";
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}

// Returns [apex, *.apex] for the root domain derived from env — no hardcoded hostname.
function getFrameAncestors() {
  const url = process.env.NEXT_PUBLIC_BRAND_URL ?? "";
  if (!url) return [];
  try {
    const { protocol, hostname } = new URL(url);
    const rootDomain = hostname.split(".").slice(-2).join("."); // e.g. "sitepins.com"
    return [`${protocol}//${rootDomain}`, `${protocol}//*.${rootDomain}`];
  } catch {
    return [];
  }
}

// Host of the configured media bucket (any S3-compatible provider), so
// next/image can render uploads served from AWS S3 / R2 / MinIO / B2
function getBucketHost() {
  const url = process.env.NEXT_PUBLIC_BUCKET_URL;
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

const remotePattern = (hostname) => ({
  protocol: "https",
  hostname,
  pathname: "/**",
});

// Merge helper: combine array directives without duplicates
const mergeDirectives = (base, override) => {
  const merged = { ...base };
  for (const [k, v] of Object.entries(override || {})) {
    if (Array.isArray(v) && Array.isArray(merged[k])) {
      merged[k] = Array.from(new Set([...merged[k], ...v]));
    } else {
      merged[k] = v;
    }
  }
  return merged;
};

function buildHeaders(overlay) {
  const isDev = process.env.NODE_ENV !== "production";

  // Build CSP from structured directives so it's easier to maintain.
  const buildCSP = (directives) =>
    Object.entries(directives)
      .map(([k, v]) => `${k} ${Array.isArray(v) ? v.join(" ") : v};`)
      .join(" ");

  // shared host groups to keep CSP DRY and maintainable
  const HOSTS = {
    SELF: ["'self'"],
    DATA_BLOB: ["data:", "blob:"],
    SPACES: ["https://*.digitaloceanspaces.com"],
    MONACO: ["https://cdn.jsdelivr.net", "https://unpkg.com", "https://esm.sh"],
    G_FONTS: ["https://fonts.googleapis.com", "https://fonts.gstatic.com"],
    GSTATIC: ["https://t1.gstatic.com"],
    GITHUB: [
      "https://api.github.com",
      "https://github.com",
      "https://raw.githubusercontent.com",
    ],
    GITLAB: ["https://api.gitlab.com", "https://gitlab.com"],
  };

  // derive backend origins from env
  const backendOrigin = getOrigin(process.env.NEXT_PUBLIC_BACKEND_URL);
  const hpWsOrigin = getOrigin(process.env.NEXT_PUBLIC_HP_WS_URL);

  const BACKENDS = [backendOrigin, hpWsOrigin].filter(Boolean);
  const BACKEND_WS = BACKENDS.map((origin) => origin.replace(/^http/, "ws"));

  // Extra connect-src origins an overlay derives from env at build time (e.g.
  // partner API backends), named by env var so the overlay never hardcodes a
  // deployment-specific URL.
  const overlayEnvOrigins = (overlay.connectEnvVars || [])
    .map((name) => getOrigin(process.env[name]))
    .filter(Boolean);

  // Base (prod) directives
  const baseDirectives = {
    "default-src": [...HOSTS.SELF],
    "script-src": [
      ...HOSTS.SELF,
      ...HOSTS.MONACO,
      ...HOSTS.DATA_BLOB,
      "'unsafe-inline'",
      "'wasm-unsafe-eval'",
    ],
    "script-src-elem": [
      ...HOSTS.SELF,
      ...HOSTS.MONACO,
      ...HOSTS.DATA_BLOB,
      "'unsafe-inline'",
      "'wasm-unsafe-eval'",
    ],
    "connect-src": [
      ...HOSTS.SELF,
      ...HOSTS.GITHUB,
      ...HOSTS.GITLAB,
      ...HOSTS.GSTATIC,
      ...HOSTS.MONACO,
      ...HOSTS.SPACES,
      ...BACKENDS,
      ...BACKEND_WS,
      ...overlayEnvOrigins,
    ],
    "img-src": [
      "*", // Allow all images for CMS support
      ...HOSTS.DATA_BLOB,
    ],
    "frame-src": [...HOSTS.SELF, ...getFrameAncestors()],
    "font-src": [
      ...HOSTS.SELF,
      ...HOSTS.DATA_BLOB,
      ...HOSTS.G_FONTS,
      ...HOSTS.MONACO,
    ],
    "style-src": [
      ...HOSTS.SELF,
      ...HOSTS.G_FONTS,
      ...HOSTS.MONACO,
      "'unsafe-inline'",
    ],
    "style-src-elem": [
      ...HOSTS.SELF,
      ...HOSTS.G_FONTS,
      ...HOSTS.MONACO,
      "'unsafe-inline'",
    ],
    "worker-src": [...HOSTS.SELF, "blob:"],
    "object-src": ["'none'"],
    "base-uri": [...HOSTS.SELF],
    "form-action": [...HOSTS.SELF],
    "frame-ancestors": ["'self'", ...getFrameAncestors()],
    "upgrade-insecure-requests": [],
  };

  // Edition overlay contributes extra hosts, per directive.
  const editionDirectives = mergeDirectives(baseDirectives, overlay.csp);

  const devOverrides = {
    "script-src": ["'unsafe-eval'"],
    "script-src-elem": ["'unsafe-eval'"],
    "connect-src": ["*"],
    "upgrade-insecure-requests": null, // Disable in dev
  };

  const cspProdDirectives = { ...editionDirectives };
  // In production, we keep upgrade-insecure-requests. In dev, we remove it.
  if (isDev) {
    delete cspProdDirectives["upgrade-insecure-requests"];
  }

  const cspDevDirectives = mergeDirectives(editionDirectives, devOverrides);
  if (isDev) {
    delete cspDevDirectives["upgrade-insecure-requests"];
  }

  const cspHeaderValue = buildCSP(isDev ? cspDevDirectives : cspProdDirectives);

  return [
    {
      source: "/(.*)",
      headers: [
        {
          key: "Content-Security-Policy",
          value: cspHeaderValue.replace(/\s{2,}/g, " ").trim(),
        },
        // X-Frame-Options removed — CSP frame-ancestors above takes precedence.
      ],
    },
  ];
}

/** @returns {Promise<import('next').NextConfig>} */
// Hosts of absolute brand logo URLs, so next/image may load them.
function getBrandImageHosts() {
  const hosts = [
    process.env.NEXT_PUBLIC_BRAND_LOGO,
    process.env.NEXT_PUBLIC_BRAND_LOGO_DARK,
  ].map((url) => {
    try {
      return url && /^https?:\/\//.test(url) ? new URL(url).host : null;
    } catch {
      return null;
    }
  });
  return [...new Set(hosts.filter(Boolean))];
}

const REQUIRED_BRAND_ENV = [
  "NEXT_PUBLIC_BRAND_NAME",
  "NEXT_PUBLIC_BRAND_URL",
  "NEXT_PUBLIC_BRAND_SLUG",
  "NEXT_PUBLIC_BRAND_LOGO",
  "NEXT_PUBLIC_BRAND_LOGO_DARK",
  "NEXT_PUBLIC_BRAND_LOGO_ICON",
  "NEXT_PUBLIC_BRAND_LOGO_WIDTH",
  "NEXT_PUBLIC_BRAND_LOGO_HEIGHT",
  "NEXT_PUBLIC_BRAND_FAVICON",
  "NEXT_PUBLIC_TERMS_URL",
  "NEXT_PUBLIC_PRIVACY_URL",
  "NEXT_PUBLIC_SUPPORT_URL",
  "NEXT_PUBLIC_UPDATES_URL",
  "NEXT_PUBLIC_STATUS_URL",
  "NEXT_PUBLIC_COMMUNITY_URL",
  "NEXT_PUBLIC_DOCS_URL",
  "NEXT_PUBLIC_SOURCE_URL",
  "NEXT_PUBLIC_GIT_APP_NAME",
];

function assertBrandEnv() {
  const missing = REQUIRED_BRAND_ENV.filter((name) => !process.env[name]?.trim());
  if (missing.length) {
    throw new Error(
      `Missing required env vars (see app/.env.example): ${missing.join(", ")}`,
    );
  }
}

export default async function nextConfig() {
  assertBrandEnv();
  const overlay = await loadOverlay();
  const bucketHost = getBucketHost();

  const resolveExtensions = overlay.resolveExtensions?.length
    ? [
        ...overlay.resolveExtensions,
        ".tsx",
        ".ts",
        ".jsx",
        ".js",
        ".mjs",
        ".json",
      ]
    : null;

  return withNextIntl({
    reactStrictMode: true,
    trailingSlash: false,
    env: {
      NEXT_PUBLIC_APP_VERSION: packageJson.version,
    },
    ...(overlay.tsconfigPath && {
      typescript: { tsconfigPath: overlay.tsconfigPath },
    }),
    ...((resolveExtensions || overlay.turbopackRoot) && {
      turbopack: {
        ...(resolveExtensions && { resolveExtensions }),
        ...(overlay.turbopackRoot && {
          root: path.resolve(process.cwd(), overlay.turbopackRoot),
        }),
      },
    }),
    ...(resolveExtensions && {
      webpack: (config) => {
        config.resolve.extensions = [
          ...resolveExtensions.filter((e) => !e.endsWith(".json")),
          ...config.resolve.extensions,
        ];
        return config;
      },
    }),
    logging: {
      fetches: {
        fullUrl: true,
      },
    },
    experimental: {
      serverActions: {
        bodySizeLimit: "25mb",
      },
    },
    images: {
      remotePatterns: [
        remotePattern("avatars.githubusercontent.com"),
        remotePattern("raw.githubusercontent.com"),
        remotePattern("github.githubassets.com"),
        remotePattern("images.unsplash.com"),
        remotePattern("*.digitaloceanspaces.com"),
        // configured S3-compatible media bucket (AWS/R2/MinIO/B2), if any
        ...(bucketHost ? [remotePattern(bucketHost)] : []),
        remotePattern("*.googleusercontent.com"),
        // hosts an edition overlay serves its own imagery from
        ...(overlay.imageHosts || []).map(remotePattern),
        // white-label logos hosted off-site (NEXT_PUBLIC_BRAND_LOGO*)
        ...getBrandImageHosts().map(remotePattern),
      ],
    },

    async headers() {
      return buildHeaders(overlay);
    },
  });
}
