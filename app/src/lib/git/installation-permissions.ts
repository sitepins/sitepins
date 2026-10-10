export type TPermissionLevel = "read" | "write";

/** What the editor needs on the project repository (see SKILL.md endpoint audit). */
export const COLLABORATOR_PERMISSIONS: Record<string, TPermissionLevel> = {
  contents: "write",
  pull_requests: "write",
  metadata: "read",
  statuses: "read",
  deployments: "read",
};

const RANK: Record<string, number> = { read: 1, write: 2, admin: 3 };

/**
 * Caps each wanted permission at what the installation was granted. Asking
 * for more than the installation holds makes GitHub reject the whole token.
 */
export function narrowPermissions(
  granted: Record<string, string | undefined> | undefined,
  wanted: Record<string, TPermissionLevel> = COLLABORATOR_PERMISSIONS,
): Record<string, TPermissionLevel> {
  const result: Record<string, TPermissionLevel> = {};
  for (const [name, level] of Object.entries(wanted)) {
    const grantedRank = RANK[granted?.[name] ?? ""] ?? 0;
    if (grantedRank === 0) continue;
    result[name] = grantedRank >= RANK[level] ? level : "read";
  }
  return result;
}
