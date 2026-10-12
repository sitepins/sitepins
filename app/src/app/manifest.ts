import { BRAND_ICONS, BRAND_LOGO_ICON, BRAND_NAME } from "@/lib/brand";
import type { MetadataRoute } from "next";

// Icon MIME type from its extension; brand icons may be PNG, SVG or WebP.
const iconType = (src: string) => {
  const ext = src.split("?")[0].split(".").pop()?.toLowerCase();
  if (ext === "svg") return "image/svg+xml";
  if (ext === "webp") return "image/webp";
  if (ext === "ico") return "image/x-icon";
  return "image/png";
};

export default function manifest(): MetadataRoute.Manifest {
  const siteTitle = BRAND_NAME;

  return {
    name: siteTitle,
    short_name: siteTitle,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    orientation: "any",
    lang: "en",
    dir: "ltr",
    categories: ["productivity", "developer", "business", "utilities"],
    icons: [
      ...BRAND_ICONS.map((icon) => ({ ...icon, type: iconType(icon.src) })),
      {
        src: BRAND_LOGO_ICON,
        sizes: "any",
        type: iconType(BRAND_LOGO_ICON),
        purpose: "any",
      },
    ],
    shortcuts: [
      {
        name: "Dashboard",
        short_name: "Dashboard",
        description: `Open ${siteTitle} Dashboard`,
        url: "/dashboard",
        icons: [{ src: BRAND_ICONS[0].src, sizes: BRAND_ICONS[0].sizes }],
      },
    ],
  };
}
