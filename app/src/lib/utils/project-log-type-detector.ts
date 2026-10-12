import { CONFIG_DIR } from "@/lib/brand";
import { isSchemaPath, isSnippetPath } from "@/lib/config-dir";
import isConfigFile from "@/lib/utils/is-config-file";
import { EProjectLogType } from "@/redux/features/project-log/type";

// Helper to infer log type from a file path and project config
export function getLogType(
  filePath?: string,
  config?: { content?: string },
): EProjectLogType {
  if (!filePath) return EProjectLogType.CONTENT;
  const p = String(filePath).replace(/^\/+/, "");
  // explicit schema/snippet folders
  if (isSchemaPath(p)) return EProjectLogType.SCHEMA;
  if (isSnippetPath(p)) return EProjectLogType.SNIPPET;
  if (p.startsWith("media/")) return EProjectLogType.MEDIA;
  if (config && config.content) {
    const contentRoot = String(config.content).replace(/^\/+/, "");
    if (p.startsWith(contentRoot)) return EProjectLogType.CONTENT;
  }

  if (p.includes(CONFIG_DIR) || isConfigFile(p)) return EProjectLogType.CONFIG;

  // If not content, media, config, schema, or snippet - it's code
  return EProjectLogType.CODE;
}
