// Brand identity for the running instance. A fork or self-hosted deploy can
// override any of these via NEXT_PUBLIC_* env vars so it doesn't ship the
// upstream Sitepins name, domain, or support links.

export const BRAND_NAME = process.env.NEXT_PUBLIC_BRAND_NAME || "Sitepins";

export const BRAND_URL =
  process.env.NEXT_PUBLIC_BRAND_URL || "https://sitepins.com";

export const SUPPORT_URL =
  process.env.NEXT_PUBLIC_SUPPORT_URL || `${BRAND_URL}/contact`;

export const UPDATES_URL =
  process.env.NEXT_PUBLIC_UPDATES_URL || "https://updates.sitepins.com";

export const COMMUNITY_URL =
  process.env.NEXT_PUBLIC_COMMUNITY_URL || "https://discord.gg/KrpvHfqcNA";

// Domain used to synthesize the git commit author email for the CMS app.
// Derived from BRAND_URL's host when not set explicitly.
export const GIT_COMMIT_EMAIL_DOMAIN =
  process.env.NEXT_PUBLIC_GIT_COMMIT_EMAIL_DOMAIN ||
  (() => {
    try {
      return new URL(BRAND_URL).host;
    } catch {
      return "sitepins.com";
    }
  })();
