/**
 * A content query resolves either to already-decoded text (`data`) or to the
 * provider's base64 payload (`content`), depending on the endpoint and whether
 * the parser ran. Both providers use the same two shapes.
 */
export const decodeGitContent = (entry: unknown): string => {
  const value = entry as { data?: unknown; content?: unknown } | undefined;

  if (typeof value?.data === "string") return value.data;
  if (typeof value?.content !== "string" || !value.content) return "";

  try {
    return decodeURIComponent(escape(atob(value.content.replace(/\n/g, ""))));
  } catch {
    return "";
  }
};
