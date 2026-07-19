export function fmDetector(content: string, ext?: string) {
  const extension = (ext || "").toLowerCase();

  const trimmed = content.trimStart();

  // Detect by explicit file extension first
  const extIndicatesYaml = extension === ".yaml" || extension === ".yml";
  const extIndicatesToml = extension === ".toml";
  const extIndicatesJson = extension === ".json" || extension === ".jsonc";

  // Heuristics for content-based detection
  const startsWithYamlFence = trimmed.startsWith("---");
  const startsWithTomlFence =
    trimmed.startsWith("+++") || trimmed.startsWith("---toml");
  const startsWithJson = trimmed.startsWith("{") || trimmed.startsWith("[");

  // Simple YAML key:value heuristic for files that are plain YAML (no frontmatter fences)
  const looksLikeYamlKeyValue = /^\s*[^#\n\r][^:\n]+:\s+/m.test(content);

  const isToml = extIndicatesToml || startsWithTomlFence;
  const isJson = extIndicatesJson || startsWithJson;
  const isYaml =
    extIndicatesYaml ||
    startsWithYamlFence ||
    // markdown/mdx files often use YAML frontmatter
    extension === ".md" ||
    extension === ".mdx" ||
    looksLikeYamlKeyValue;

  if (isToml) return "toml";
  if (isJson) return "json";
  if (isYaml) return "yaml";

  return "toml";
}
