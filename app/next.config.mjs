import createNextIntlPlugin from "next-intl/plugin";
import path from "node:path";

const withNextIntl = createNextIntlPlugin("./src/lib/i18n/request.ts");

// "cloud" builds (the hosted SaaS) overlay extra files into src/ and prefer
// `.cloud.ts(x)` module variants over their open-source counterparts.
const isCloudEdition = process.env.SITEPINS_EDITION === "cloud";

const defaultExtensions = [".tsx", ".ts", ".jsx", ".js", ".mjs", ".json"];
const cloudExtensions = [
  ".cloud.tsx",
  ".cloud.ts",
  ".cloud.jsx",
  ".cloud.js",
  ...defaultExtensions,
];

/** @type {import('next').NextConfig} */

function getOrigin(url) {
  if (!url) return "";
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}

// Host of the configured media bucket (any S3-compatible provider), so
// next/image can render uploads served from AWS S3 / R2 / MinIO / B2, not
// only DigitalOcean Spaces.
function getBucketHost() {
  const url = process.env.NEXT_PUBLIC_BUCKET_URL;
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}
const bucketHost = getBucketHost();

const nextConfig = {
  reactStrictMode: true,
  trailingSlash: false,
  ...(isCloudEdition && {
    typescript: { tsconfigPath: "tsconfig.cloud.json" },
    turbopack: {
      resolveExtensions: cloudExtensions,
      // This app runs inside sitepins-cloud/core/app, which is itself a
      // nested pnpm workspace (core/pnpm-workspace.yaml) inside the outer
      // one (sitepins-cloud/pnpm-workspace.yaml). Pin the root to the outer
      // workspace explicitly so Turbopack doesn't have to guess between the
      // two lockfiles.
      root: path.join(process.cwd(), "..", ".."),
    },
    webpack: (config) => {
      config.resolve.extensions = [
        ...cloudExtensions.filter((e) => !e.endsWith(".json")),
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
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "raw.githubusercontent.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "github.githubassets.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "*.digitaloceanspaces.com",
        pathname: "/**",
      },
      // configured S3-compatible media bucket (AWS/R2/MinIO/B2), if any
      ...(bucketHost
        ? [{ protocol: "https", hostname: bucketHost, pathname: "/**" }]
        : []),
      // partner-theme thumbnails (cloud template catalog only)
      ...(isCloudEdition
        ? [
            {
              protocol: "https",
              hostname: "assets.teamosis.com",
              pathname: "/**",
            },
          ]
        : []),
      {
        protocol: "https",
        hostname: "*.googleusercontent.com",
        pathname: "/**",
      },
    ],
  },

  async headers() {
    const isDev = process.env.NODE_ENV !== "production";

    // Build CSP from structured directives so it's easier to maintain.
    const buildCSP = (directives) =>
      Object.entries(directives)
        .map(([k, v]) => `${k} ${Array.isArray(v) ? v.join(" ") : v};`)
        .join(" ");

    // shared host groups to keep CSP DRY and maintainable
    // Marketing/analytics/affiliate hosts are only needed by the hosted
    // cloud edition (self-hosters run their own instance with no
    // marketing site or ad/analytics tracking wired in by default).
    const cloudOnly = (hosts) => (isCloudEdition ? hosts : []);

    const HOSTS = {
      SELF: ["'self'"],
      DATA_BLOB: ["data:", "blob:"],
      GA: cloudOnly([
        "https://www.google-analytics.com",
        "https://www.googletagmanager.com",
        "https://analytics.google.com",
      ]),
      ADS: cloudOnly([
        "https://stats.g.doubleclick.net",
        "https://www.google.com.bd",
      ]),
      GOOGLE_ADS: cloudOnly(["https://www.googleadservices.com"]),
      PADDLE: cloudOnly(["https://*.paddle.com"]),
      PARTNERO: cloudOnly(["https://*.partnero.com"]),
      POSTHOG: cloudOnly(["https://*.posthog.com"]),
      SPACES: ["https://*.digitaloceanspaces.com"],
      FB_SDK: cloudOnly(["https://connect.facebook.net"]),
      REDDIT: cloudOnly([
        "https://www.redditstatic.com",
        "https://pixel-config.reddit.com",
        "https://conversions-config.reddit.com",
      ]),
      TWITTER: cloudOnly(["https://static.ads-twitter.com"]),
      CLARITY: cloudOnly(["https://*.clarity.ms"]),
      BING: cloudOnly(["https://*.bing.com"]),
      FB_DOMAIN: cloudOnly(["https://www.facebook.com"]),
      DOUBLECLICK: cloudOnly(["https://googleads.g.doubleclick.net"]),
      GOOGLE_COLLECT: cloudOnly(["https://www.google.com"]),
      THRIVE: cloudOnly(["https://api.thrivedesk.com"]),
      YT: cloudOnly([
        "https://www.youtube.com",
        "https://www.youtube-nocookie.com",
        "https://s.ytimg.com",
      ]),
      CALENDLY: cloudOnly(["https://calendly.com", "https://*.calendly.com"]),
      MONACO: [
        "https://cdn.jsdelivr.net",
        "https://unpkg.com",
        "https://esm.sh",
      ],
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

    // Partner order-check backends (themefisher / gethugothemes) are used only
    // by the hosted cloud edition's partner-login flow, so they're whitelisted
    // in the CSP only there.
    const partnerBackends = cloudOnly([
      getOrigin(process.env.NEXT_PUBLIC_TF_BACKEND_URL),
      getOrigin(process.env.NEXT_PUBLIC_GHT_BACKEND_URL),
    ]);

    const BACKENDS = [backendOrigin, hpWsOrigin, ...partnerBackends].filter(
      Boolean,
    );

    const BACKEND_WS = BACKENDS.map((origin) => origin.replace(/^http/, "ws"));

    // Base (prod) directives
    const baseDirectives = {
      "default-src": [...HOSTS.SELF],
      "script-src": [
        ...HOSTS.SELF,
        ...HOSTS.GA,
        ...HOSTS.DOUBLECLICK,
        ...HOSTS.TWITTER,
        ...HOSTS.FB_SDK,
        ...HOSTS.REDDIT,
        ...HOSTS.CLARITY,
        ...HOSTS.PADDLE,
        ...HOSTS.PARTNERO,
        ...HOSTS.POSTHOG,
        ...HOSTS.YT,
        ...HOSTS.MONACO,
        ...HOSTS.DATA_BLOB,
        "'unsafe-inline'",
        "'wasm-unsafe-eval'",
      ],
      "script-src-elem": [
        ...HOSTS.SELF,
        ...HOSTS.GA,
        ...HOSTS.DOUBLECLICK,
        ...HOSTS.TWITTER,
        ...HOSTS.FB_SDK,
        ...HOSTS.REDDIT,
        ...HOSTS.CLARITY,
        ...HOSTS.PADDLE,
        ...HOSTS.PARTNERO,
        ...HOSTS.POSTHOG,
        ...HOSTS.YT,
        ...HOSTS.MONACO,
        ...HOSTS.DATA_BLOB,
        "'unsafe-inline'",
        "'wasm-unsafe-eval'",
      ],
      "connect-src": [
        ...HOSTS.SELF,
        ...HOSTS.GA,
        ...HOSTS.GOOGLE_COLLECT,
        ...HOSTS.REDDIT,
        ...HOSTS.FB_DOMAIN,
        ...HOSTS.CLARITY,
        ...HOSTS.BING,
        ...HOSTS.PADDLE,
        ...HOSTS.POSTHOG,
        ...HOSTS.PARTNERO,
        ...HOSTS.GITHUB,
        ...HOSTS.GITLAB,
        ...HOSTS.GSTATIC,
        ...HOSTS.MONACO,
        ...HOSTS.GOOGLE_ADS,
        ...HOSTS.THRIVE,
        ...HOSTS.SPACES,
        ...HOSTS.ADS,
        ...BACKENDS,
        ...BACKEND_WS,
        ...cloudOnly(["wss://*.posthog.com"]),
      ],
      "img-src": [
        "*", // Allow all images for CMS support
        ...HOSTS.DATA_BLOB,
      ],
      "frame-src": [
        ...HOSTS.SELF,
        ...HOSTS.PADDLE,
        ...HOSTS.YT,
        ...HOSTS.GA,
        ...HOSTS.FB_DOMAIN,
        ...HOSTS.CALENDLY,
      ],
      "font-src": [
        ...HOSTS.SELF,
        ...HOSTS.DATA_BLOB,
        ...HOSTS.G_FONTS,
        ...HOSTS.MONACO,
      ],
      "style-src": [
        ...HOSTS.SELF,
        ...HOSTS.PADDLE,
        ...HOSTS.G_FONTS,
        ...HOSTS.MONACO,
        "'unsafe-inline'",
      ],
      "style-src-elem": [
        ...HOSTS.SELF,
        ...HOSTS.PADDLE,
        ...HOSTS.G_FONTS,
        ...HOSTS.MONACO,
        "'unsafe-inline'",
      ],
      "worker-src": [...HOSTS.SELF, "blob:"],
      "object-src": ["'none'"],
      "base-uri": [...HOSTS.SELF],
      "form-action": [...HOSTS.SELF, ...HOSTS.FB_DOMAIN],
      "frame-ancestors": ["'none'"],
      "upgrade-insecure-requests": [],
    };

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

    const devOverrides = {
      "script-src": ["'unsafe-eval'"],
      "script-src-elem": ["'unsafe-eval'"],
      "connect-src": ["*"],
      "upgrade-insecure-requests": null, // Disable in dev
    };

    const cspProdDirectives = { ...baseDirectives };
    // In production, we keep upgrade-insecure-requests. In dev, we remove it.
    if (isDev) {
      delete cspProdDirectives["upgrade-insecure-requests"];
    }

    const cspDevDirectives = mergeDirectives(baseDirectives, devOverrides);
    if (isDev) {
      delete cspDevDirectives["upgrade-insecure-requests"];
    }

    const cspHeaderValue = buildCSP(
      isDev ? cspDevDirectives : cspProdDirectives,
    );

    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: cspHeaderValue.replace(/\s{2,}/g, " ").trim(),
          },
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
