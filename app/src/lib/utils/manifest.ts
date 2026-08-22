import { getSitepinsManifest } from "@/lib/version";

/**
 * Returns the repository relative file path for .well-known/sitepins.json.
 */
export function getManifestPath(publicPath?: string): string {
  const cleanPublic = publicPath ? publicPath.replace(/^\/+|\/+$/g, "") : "";
  return cleanPublic
    ? `${cleanPublic}/.well-known/sitepins.json`
    : ".well-known/sitepins.json";
}

/**
 * Generates the manifest file descriptor ({ path, content }) for Sitepins CMS metadata.
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
