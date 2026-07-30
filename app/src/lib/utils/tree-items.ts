import { TTree } from "@/types";

/**
 * A trees query resolves to `{ files }` after transformation, but the raw
 * GitHub/GitLab payload uses `tree`, and GitLab's repo-tree endpoint returns
 * the array itself. Callers that read the cache directly can see any of them.
 */
export const treeItemsOf = (result: unknown): TTree[] => {
  if (Array.isArray(result)) return result as TTree[];
  const value = result as { files?: unknown; tree?: unknown } | undefined;
  const items = value?.files ?? value?.tree;
  return Array.isArray(items) ? (items as TTree[]) : [];
};
