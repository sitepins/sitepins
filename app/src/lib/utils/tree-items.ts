import { TTree } from "@/types";

/**
 * A trees query resolves to `{ files }` after transformation, but the raw
 * GitHub/GitLab payload uses `tree`. Callers that read the cache directly can
 * see either.
 */
export const treeItemsOf = (result: unknown): TTree[] => {
  const value = result as { files?: unknown; tree?: unknown } | undefined;
  const items = value?.files ?? value?.tree;
  return Array.isArray(items) ? (items as TTree[]) : [];
};
