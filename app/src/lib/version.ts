import packageJson from "@/../package.json";

export const APP_VERSION =
  process.env.NEXT_PUBLIC_APP_VERSION || packageJson.version || "1.0.0";

export const SITEPINS_GENERATOR = "Sitepins CMS";

export const sitepinsManifest = {
  cms: "Sitepins",
  generator: SITEPINS_GENERATOR,
  version: APP_VERSION,
};

export function getSitepinsManifest() {
  return {
    cms: "Sitepins",
    generator: SITEPINS_GENERATOR,
    version: APP_VERSION,
  };
}
