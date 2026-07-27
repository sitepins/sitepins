// Translation namespaces bundled with the open-source build.
// A hosted deployment can override this module (namespaces.cloud.ts) to add
// cloud-only namespaces such as billing and pricing.
export const namespaces = [
  "add-site",
  "auth",
  "common",
  "dashboard",
  "directory-view",
  "editor",
  "not-found",
  "media",
  "navigation",
  "org",
  "project",
  "project-settings",
  "provider-install",
  "schema",
  "search",
] as const;
