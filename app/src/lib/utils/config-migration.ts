import manifest from "@/config/manifest.json";
import { Framework } from "@/lib/utils/framework-detector";
import { TConfig } from "@/types";

/**
 * Migrates old config format to new simplified format
 *
 * Old format:
 * {
 *   content: { root: "src/content" },
 *   media: { root: "exampleSite/assets/images", public: "assets/images" },
 *   code: { root: "src" },
 *   themeConfig: {},
 *   showCommitModal: true,
 * }
 *
 * New format:
 * {
 *   content: "src/content",
 *   media: "exampleSite/assets/images",
 *   public: "static",
 *   configs: {},
 *   "custom-commit": true,
 * }
 */
export function migrateConfig(
  config: any,
  framework: Framework = null,
): TConfig {
  // If already in new format (string values), return as is
  if (
    typeof config.content === "string" &&
    typeof config.media === "string" &&
    typeof config.public === "string"
  ) {
    const migrated: any = { ...config };

    // Move custom-commit to customCommit if exists
    if ("custom-commit" in migrated && !("customCommit" in migrated)) {
      migrated.customCommit = migrated["custom-commit"];
      delete migrated["custom-commit"];
    }

    return migrated as TConfig;
  }

  // Migrate from old nested format
  const migrated: any = { ...config };

  // Migrate content
  if (
    config.content &&
    typeof config.content === "object" &&
    "root" in config.content
  ) {
    migrated.content = config.content.root || "";
  }

  // Migrate media and extract public from old media.public
  if (config.media && typeof config.media === "object") {
    migrated.media = config.media.root || "";

    // Extract public from old media.public if present
    if ("public" in config.media && !config.public) {
      migrated.public = config.media.public || "";
    }
  }

  // Attempt to infer framework from paths.
  // We do this even if 'framework' is provided, because 'exampleSite' presence is a very strong indicator
  // that supersedes a generic 'hugo' or 'undefined' framework detection.
  const contentPath = migrated.content || "";

  if (contentPath.includes("exampleSite")) {
    framework = "hugo_examplesite";
  } else if (!framework && contentPath === "content") {
    framework = "hugo";
  }

  // Set public folder based on framework
  if (framework === "hugo") {
    migrated.public = "static";
  } else if (framework === "hugo_examplesite") {
    migrated.public = "exampleSite/static";
  }

  // Ensure public exists (fallback to empty string)
  if (!migrated.public) {
    migrated.public = "";
  }

  // Rename themeConfig to configs
  if ("themeConfig" in migrated) {
    migrated.configs = migrated.themeConfig;
    delete migrated.themeConfig;
  }

  // Rename showCommitModal to customCommit
  if ("showCommitModal" in migrated) {
    migrated.customCommit = migrated.showCommitModal;
    delete migrated.showCommitModal;
  } else if ("custom-commit" in migrated) {
    migrated.customCommit = migrated["custom-commit"];
    delete migrated["custom-commit"];
  }

  // Remove code property as it's no longer used in TConfig
  if ("code" in migrated) {
    delete migrated.code;
  }

  return migrated as TConfig;
}

/**
 * Check if config is in old format
 */
export function isOldConfigFormat(config: any): boolean {
  return (
    (config.content &&
      typeof config.content === "object" &&
      "root" in config.content) ||
    (config.media &&
      typeof config.media === "object" &&
      "root" in config.media) ||
    "showCommitModal" in config
  );
}

export function getManifestFile(publicPath: string) {
  const path = publicPath
    ? `${publicPath}/.well-known/sitepins.json`
    : ".well-known/sitepins.json";
  return {
    path,
    content: JSON.stringify(manifest, null, 2),
  };
}
