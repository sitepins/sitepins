import { SCHEMA_FOLDER, SNIPPET_FOLDER } from "@/lib/constant";
import isConfigFile from "@/lib/utils/is-config-file";
import { EProjectLogType } from "@/redux/features/project-log/type";

// Helper to infer log type from a file path and project config
export function getLogType(filePath?: string, config?: any): EProjectLogType {
  if (!filePath) return EProjectLogType.CONTENT;
  const p = String(filePath).replace(/^\/+/, "");
  // explicit schema/snippet folders
  if (p.startsWith(SCHEMA_FOLDER.replace(/^\/+/, "")))
    return EProjectLogType.SCHEMA;
  if (p.startsWith(SNIPPET_FOLDER.replace(/^\/+/, "")))
    return EProjectLogType.SNIPPET;
  if (p.startsWith("media/")) return EProjectLogType.MEDIA;
  if (config && config.content) {
    const contentRoot = String(config.content).replace(/^\/+/, "");
    if (p.startsWith(contentRoot)) return EProjectLogType.CONTENT;
  }

  if (
    p.startsWith(".sitepins") ||
    p.includes(".sitepins") ||
    p === ".sitepins/config.json" ||
    isConfigFile(p)
  )
    return EProjectLogType.CONFIG;

  // If not content, media, config, schema, or snippet - it's code
  return EProjectLogType.CODE;
}
