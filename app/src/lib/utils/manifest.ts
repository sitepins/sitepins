import { BRAND_SLUG } from "@/lib/brand";
import { getSitepinsManifest } from "@/lib/version";

/**
 * Returns the repository relative file path for .well-known/<slug>.json.
 */
export function getManifestPath(publicPath?: string): string {
  const cleanPublic = publicPath ? publicPath.replace(/^\/+|\/+$/g, "") : "";
  return cleanPublic
    ? `${cleanPublic}/.well-known/${BRAND_SLUG}.json`
    : `.well-known/${BRAND_SLUG}.json`;
}

/**
 * Generates the manifest file descriptor ({ path, content }) for the CMS metadata.
 */
export function getManifestFile(publicPath?: string): {
  path: string;
  content: string;
} {
  return {
    path: getManifestPath(publicPath),
    content: JSON.stringify(getSitepinsManifest(), null, 2),
  };
}
