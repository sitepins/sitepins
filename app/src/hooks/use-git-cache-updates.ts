import { pathToDir } from "@/lib/utils/path-to-dir";
import { selectConfig } from "@/redux/features/config/slice";
import {
  DirectoryEntry,
  DirectoryMutator,
  getGitProviderAdapter,
  QueryArgs,
  toTreeEntry,
  TreeCache,
} from "@/redux/features/git/provider-adapter";
import { useAppDispatch, useAppSelector } from "@/redux/store";
import { TFiles } from "@/types";
import { useCallback } from "react";
import { useStore } from "react-redux";

const parentDir = (filePath: string): string =>
  filePath.includes("/") ? filePath.slice(0, filePath.lastIndexOf("/")) : "";

export const useGitCacheUpdates = () => {
  const dispatch = useAppDispatch();
  const store = useStore();
  const config = useAppSelector(selectConfig);
  const adapter = getGitProviderAdapter(config.provider);

  // The same tree is cached under several argument shapes (root recursive,
  // per-directory shallow, ...). Rebuilding one arg object per call site is
  // where the previous version silently missed entries, so every cached entry
  // is visited and filtered by `include` instead.
  const updateTreeCaches = useCallback(
    (
      include: (args: QueryArgs) => boolean,
      recipe: (draft: TreeCache) => void,
    ) => {
      for (const args of adapter.selectCachedTreeArgs(store.getState())) {
        if (!include(args)) continue;
        adapter.updateTreeCache(dispatch, args, (draft) => {
          if (!draft?.files) return;
          recipe(draft);
          draft.trees = pathToDir(draft.files, config);
        });
      }
    },
    [adapter, config, dispatch, store],
  );

  const updateDirectoryCaches = useCallback(
    (dir: string, mutate: DirectoryMutator) => {
      for (const args of adapter.selectCachedContentArgs(store.getState())) {
        if (args[adapter.contentPathKey] !== dir) continue;
        adapter.updateDirectoryCache(dispatch, args, mutate);
      }
    },
    [adapter, dispatch, store],
  );

  const updateCacheOnCreate = useCallback(
    (newFile: TFiles) => {
      updateDirectoryCaches(parentDir(newFile.path), (files) => [
        ...files,
        newFile as DirectoryEntry,
      ]);
      updateTreeCaches(
        (args) => adapter.treeScopeCovers(args, newFile.path),
        (draft) => {
          draft.files.push(toTreeEntry(newFile));
        },
      );
    },
    [adapter, updateDirectoryCaches, updateTreeCaches],
  );

  const updateCacheOnDelete = useCallback(
    (path: string) => {
      updateDirectoryCaches(parentDir(path), (files) =>
        files.filter((file) => file.path !== path),
      );
      // Removal is a no-op on trees that never held the file, so every cached
      // entry can be visited unconditionally.
      updateTreeCaches(
        () => true,
        (draft) => {
          draft.files = draft.files.filter((file) => file.path !== path);
        },
      );
    },
    [updateDirectoryCaches, updateTreeCaches],
  );

  const updateCacheOnRename = useCallback(
    (oldPath: string, newFile: TFiles) => {
      updateTreeCaches(
        () => true,
        (draft) => {
          const found = draft.files.find((file) => file.path === oldPath);
          if (!found) return;
          found.path = newFile.path;
          found.commitDate = new Date().toISOString();
        },
      );
    },
    [updateTreeCaches],
  );

  const updateCacheOnDuplicate = useCallback(
    (newFile: TFiles) => {
      updateTreeCaches(
        (args) => adapter.treeScopeCovers(args, newFile.path),
        (draft) => {
          draft.files.push(toTreeEntry(newFile));
        },
      );
    },
    [adapter, updateTreeCaches],
  );

  return {
    updateCacheOnCreate,
    updateCacheOnDelete,
    updateCacheOnRename,
    updateCacheOnDuplicate,
  };
};
