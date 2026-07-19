// Helper: decide whether the given path should be treated as a config file
export function isConfigFile(path?: string | null) {
  if (!path) return false;
  const lower = path.toLowerCase();
  if (lower.includes("/configs/") || lower.includes("/config/")) return true;
  return [".toml", ".json", ".yaml", ".yml", ".ini"].some((ext) =>
    lower.endsWith(ext),
  );
}

export default isConfigFile;
