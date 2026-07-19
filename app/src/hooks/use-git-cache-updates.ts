import { pathToDir } from "@/lib/utils/path-to-dir";
import { isGitLabProvider } from "@/lib/utils/provider-checker";
import { selectConfig } from "@/redux/features/config/slice";
import { githubContentApi } from "@/redux/features/github";
import { gitlabContentApi } from "@/redux/features/gitlab";
import { useAppDispatch } from "@/redux/store";
import { TFiles } from "@/types";
import { useCallback } from "react";
import { useSelector } from "react-redux";

export const useGitCacheUpdates = () => {
  const dispatch = useAppDispatch();
  const config = useSelector(selectConfig);

  const updateCacheOnCreate = useCallback(
    (newFile: TFiles) => {
      if (isGitLabProvider(config.provider)) {
        dispatch(
          gitlabContentApi.util.updateQueryData(
            "getGitLabContent",
            {
              id: config.repoName
                ? `${config.owner}/${config.repoName}`
                : config.owner,
              file_path: newFile.path.substring(
                0,
                newFile.path.lastIndexOf("/"),
              ),
              ref: config.branch,
            },
            (oldData: any) => {
              if (oldData && Array.isArray(oldData.items)) {
                oldData.items.push(newFile);
              }
            },
          ),
        );

        dispatch(
          gitlabContentApi.util.updateQueryData(
            "getGitLabTrees",
            {
              id: config.repoName
                ? `${config.owner}/${config.repoName}`
                : config.owner,
              ref: config.branch,
              recursive: true,
              config: config,
            },
            (draft: any) => {
              draft.files.push(newFile);
              draft.trees = pathToDir(draft.files, config);
            },
          ),
        );
      } else {
        dispatch(
          githubContentApi.util.updateQueryData(
            "getGitHubContent",
            {
              owner: config.owner,
              repo: config.repoName,
              path: newFile.path.substring(0, newFile.path.lastIndexOf("/")),
              ref: config.branch,
            },
            (oldData) => {
              const files = Array.isArray(oldData)
                ? (oldData as (TFiles & { commitDate: string })[])
                : [];
              return [...files, newFile];
            },
          ),
        );

        dispatch(
          githubContentApi.util.updateQueryData(
            "getGitHubTrees",
            {
              owner: config.owner,
              repo: config.repoName,
              tree_sha: config.branch,
              recursive: "1",
              config: config,
            },
            (draft: any) => {
              draft.trees.push(newFile);
              draft.files.push(newFile);
              draft.trees = pathToDir(draft.files, config);
            },
          ),
        );
      }
    },
    [config, dispatch],
  );

  const updateCacheOnDelete = useCallback(
    (path: string) => {
      // update cached listing for parent folder
      const parentPath = path.includes("/")
        ? path.substring(0, path.lastIndexOf("/"))
        : "";

      if (isGitLabProvider(config.provider)) {
        try {
          dispatch(
            gitlabContentApi.util.updateQueryData(
              "getGitLabContent",
              {
                id: `${config.owner}/${config.repoName}`,
                file_path: parentPath,
                ref: config.branch,
              },
              (oldData: any) => {
                if (oldData && Array.isArray(oldData.items)) {
                  oldData.items = oldData.items.filter(
                    (f: any) => f.path !== path,
                  );
                }
              },
            ),
          );
        } catch (e) {}

        dispatch(
          gitlabContentApi.util.updateQueryData(
            "getGitLabTrees",
            {
              id: config.repoName
                ? `${config.owner}/${config.repoName}`
                : config.owner,
              path: path.includes("/")
                ? path.substring(0, path.lastIndexOf("/"))
                : "",
              ref: config.branch,
              recursive: false,
              config: config,
            },
            (draft: any) => {
              draft.files = draft.files.filter(
                (file: TFiles) => file.path !== path,
              );
              draft.files = draft.files.filter(
                (file: TFiles) => file.path !== path,
              );
              draft.trees = pathToDir(draft.files, config);
            },
          ),
        );
      } else {
        try {
          dispatch(
            githubContentApi.util.updateQueryData(
              "getGitHubContent",
              {
                owner: config.owner,
                repo: config.repoName,
                path: parentPath,
                ref: config.branch,
              },
              (oldData) => {
                const files = oldData as unknown as
                  | (TFiles & { commitDate: string })[]
                  | undefined;
                if (!files) return files;
                return files.filter((f) => f.path !== path);
              },
            ),
          );
        } catch (e) {}

        dispatch(
          githubContentApi.util.updateQueryData(
            "getGitHubTrees",
            {
              owner: config.owner,
              repo: config.repoName,
              tree_sha: config.branch,
              recursive: "1",
              config: config,
            },
            (draft: any) => {
              draft.trees = draft.trees.filter(
                (file: TFiles) => file.path !== path,
              );
              draft.files = draft.files.filter(
                (file: TFiles) => file.path !== path,
              );
              draft.trees = pathToDir(draft.files, config);
            },
          ),
        );
      }
    },
    [config, dispatch],
  );

  const updateCacheOnRename = useCallback(
    (oldPath: string, newFile: TFiles) => {
      const parentPath = newFile.path.includes("/")
        ? newFile.path.substring(0, newFile.path.lastIndexOf("/"))
        : "";

      if (isGitLabProvider(config.provider)) {
        dispatch(
          gitlabContentApi.util.updateQueryData(
            "getGitLabTrees",
            {
              id: config.repoName
                ? `${config.owner}/${config.repoName}`
                : config.owner,
              path: parentPath,
              ref: config.branch,
              recursive: false,
              config: config,
            },
            (draftData: any) => {
              const files = draftData.files as (TFiles & {
                commitDate: string;
              })[];
              const foundIndex = files.findIndex(
                (file) => file.path === oldPath,
              );

              if (foundIndex !== -1) {
                files[foundIndex].name = newFile.name;
                files[foundIndex].path = newFile.path;
                files[foundIndex].commitDate = new Date().toISOString();
              }
              draftData.trees = pathToDir(draftData.files, config);
            },
          ),
        );
      } else {
        dispatch(
          githubContentApi.util.updateQueryData(
            "getGitHubTrees",
            {
              owner: config.owner,
              repo: config.repoName,
              tree_sha: config.branch,
              recursive: "1",
              config: config,
            },
            (draft: any) => {
              // Update trees
              const treeIndex = draft.trees.findIndex(
                (file: TFiles) => file.path === oldPath,
              );
              if (treeIndex !== -1) {
                draft.trees[treeIndex].name = newFile.name;
                draft.trees[treeIndex].path = newFile.path;
                draft.trees[treeIndex].commitDate = new Date().toISOString();
              }

              // Update files
              const fileIndex = draft.files.findIndex(
                (file: TFiles) => file.path === oldPath,
              );
              if (fileIndex !== -1) {
                draft.files[fileIndex].path = newFile.path;
              }
              draft.trees = pathToDir(draft.files, config);
            },
          ),
        );
      }
    },
    [config, dispatch],
  );

  const updateCacheOnDuplicate = useCallback(
    (newFile: TFiles) => {
      const parentPath = newFile.path.includes("/")
        ? newFile.path.substring(0, newFile.path.lastIndexOf("/"))
        : "";

      if (isGitLabProvider(config.provider)) {
        dispatch(
          gitlabContentApi.util.updateQueryData(
            "getGitLabTrees",
            {
              id: config.repoName
                ? `${config.owner}/${config.repoName}`
                : config.owner,
              path: parentPath,
              ref: config.branch,
              recursive: false,
              config: config,
            },
            (oldData: any) => {
              oldData.files.push(newFile);
              oldData.trees = pathToDir(oldData.files, config);
            },
          ),
        );
      } else {
        dispatch(
          githubContentApi.util.updateQueryData(
            "getGitHubTrees",
            {
              owner: config.owner,
              repo: config.repoName,
              tree_sha: config.branch,
              recursive: "1",
              config: config,
            },
            (oldData: any) => {
              oldData.trees.push(newFile);
              oldData.files.push(newFile);
              oldData.trees = pathToDir(oldData.files, config);
            },
          ),
        );
      }
    },
    [config, dispatch],
  );

  return {
    updateCacheOnCreate,
    updateCacheOnDelete,
    updateCacheOnRename,
    updateCacheOnDuplicate,
  };
};
