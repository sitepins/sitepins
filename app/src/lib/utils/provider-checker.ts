export const normalizeGitProvider = (
  provider: string | null | undefined,
): "github" | "gitlab" | "unknown" => {
  const normalized = (provider || "").toLowerCase();
  if (normalized === "github") return "github";
  if (normalized === "gitlab") return "gitlab";
  return "unknown";
};

export const isGitHubProvider = (
  provider: string | null | undefined,
): boolean => {
  return normalizeGitProvider(provider) === "github";
};

export const isGitLabProvider = (
  provider: string | null | undefined,
): boolean => {
  return normalizeGitProvider(provider) === "gitlab";
};
