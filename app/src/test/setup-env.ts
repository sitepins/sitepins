// Module-level code in the api slices builds a better-auth client, which
// throws on an undefined base URL. Tests never reach the network, so these
// mirror the documented dev defaults rather than any real deployment.
process.env.NEXT_PUBLIC_BACKEND_URL ??= "http://localhost:4000/api/v1";
process.env.NEXT_PUBLIC_HP_WS_URL ??=
  "ws://localhost:4000/api/v1/editor/collab";
process.env.NEXT_PUBLIC_BUCKET_URL ??= "http://localhost:9000/sitepins-test";
process.env.NEXT_PUBLIC_GIT_APP_NAME ??= "sitepins-test";

const brandEnv: Record<string, string> = {
  NEXT_PUBLIC_BRAND_NAME: "Sitepins",
  NEXT_PUBLIC_BRAND_URL: "https://sitepins.com",
  NEXT_PUBLIC_BRAND_SLUG: "sitepins",
  NEXT_PUBLIC_BRAND_LOGO: "/images/logo.svg",
  NEXT_PUBLIC_BRAND_LOGO_DARK: "/images/logo-white.svg",
  NEXT_PUBLIC_BRAND_LOGO_ICON: "/images/logo-icon.svg",
  NEXT_PUBLIC_BRAND_LOGO_WIDTH: "136",
  NEXT_PUBLIC_BRAND_LOGO_HEIGHT: "40",
  NEXT_PUBLIC_BRAND_FAVICON: "/images/favicon.png",
  NEXT_PUBLIC_TERMS_URL: "https://sitepins.com/terms",
  NEXT_PUBLIC_PRIVACY_URL: "https://sitepins.com/privacy-policy",
  NEXT_PUBLIC_SUPPORT_URL: "https://sitepins.com/contact",
  NEXT_PUBLIC_UPDATES_URL: "https://updates.sitepins.com",
  NEXT_PUBLIC_STATUS_URL: "https://status.sitepins.com",
  NEXT_PUBLIC_COMMUNITY_URL: "https://discord.gg/KrpvHfqcNA",
  NEXT_PUBLIC_DOCS_URL: "https://docs.sitepins.com",
  NEXT_PUBLIC_SOURCE_URL: "https://github.com/sitepins/sitepins",
};
for (const [key, value] of Object.entries(brandEnv)) process.env[key] ??= value;
