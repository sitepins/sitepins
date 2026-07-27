import { EXTRA_PUBLIC_ROUTES, PUBLIC_ROUTES } from "@/lib/public-routes";
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: [...PUBLIC_ROUTES],
      disallow: [
        "/",
        "/login?*",
        "/register?*",
        ...EXTRA_PUBLIC_ROUTES.map((r) => `${r}?*`),
        "/*?*",
      ],
    },
  };
}
