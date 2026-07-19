import { isGitLabProvider } from "@/lib/utils/provider-checker";
import { selectConfig } from "@/redux/features/config/slice";
import {
  useCreateNewGitHubBranchRefMutation,
  useGetGitHubBranchesQuery,
  useGetGitHubContentQuery,
  useGetGitHubImageQuery,
  useGetGitHubSiteConfigQuery,
  useGetGitHubTreesQuery,
  useUpdateGitHubFilesMutation,
} from "@/redux/features/github";
import {
  useCreateGitLabBranchMutation,
  useGetGitLabBranchesQuery,
  useGetGitLabContentQuery,
  useGetGitLabImageQuery,
  useGetGitLabSiteConfigQuery,
  useGetGitLabTreesQuery,
  useUpdateGitLabFilesMutation,
} from "@/redux/features/gitlab";
import { useAppSelector } from "@/redux/store";
import { useCallback } from "react";

interface GitFile {
  path: string;
  content?: string;
  delete?: boolean;
}

interface UpdateFilesOptions {
  files: GitFile[];
  message: string;
  description?: string;
}

export function useGitProvider() {
  const config = useAppSelector(selectConfig);
  const [updateGitHubFiles, { isLoading: isGitHubPending }] =
    useUpdateGitHubFilesMutation();
  const [updateGitLabFiles, { isLoading: isGitLabPending }] =
    useUpdateGitLabFilesMutation();

  const [createGhBranch, { isLoading: isGhBranchCreating }] =
    useCreateNewGitHubBranchRefMutation();
  const [createGlBranch, { isLoading: isGlBranchCreating }] =
    useCreateGitLabBranchMutation();

  const isPending = isGitLabProvider(config.provider)
    ? isGitLabPending
    : isGitHubPending;

  const isBranchCreating = isGitLabProvider(config.provider)
    ? isGlBranchCreating
    : isGhBranchCreating;

  const updateFiles = useCallback(
    async (options: UpdateFilesOptions) => {
      if (isGitLabProvider(config.provider)) {
        return updateGitLabFiles({
          id: config.repoName
            ? `${config.owner}/${config.repoName}`
            : config.owner,
          branch: config.branch,
          files: options.files,
          message: options.message,
          description: options.description,
        });
      } else {
        return updateGitHubFiles({
          owner: config.owner,
          repo: config.repoName,
          tree: config.branch,
          files: options.files,
          message: options.message,
          description: options.description,
        });
      }
    },
    [config, updateGitHubFiles, updateGitLabFiles],
  );

  const deleteFile = useCallback(
    async (path: string, message: string) => {
      return updateFiles({
        files: [{ path, delete: true }],
        message,
      });
    },
    [updateFiles],
  );

  const renameFile = useCallback(
    async (
      oldPath: string,
      newPath: string,
      content: string,
      message: string,
    ) => {
      return updateFiles({
        files: [
          { path: oldPath, delete: true },
          { path: newPath, content },
        ],
        message,
      });
    },
    [updateFiles],
  );

  const useGitTrees = (path: string, options?: any) => {
    const isGitLab = isGitLabProvider(config.provider);
    const ghQuery = useGetGitHubTreesQuery(
      {
        owner: config.owner,
        repo: config.repoName,
        tree_sha: config.branch, // GitHub Trees API uses branch/SHA
        recursive: options?.recursive ? "1" : undefined,
        config: config,
      },
      { skip: isGitLab || !config.repoName || options?.skip },
    );

    const glQuery = useGetGitLabTreesQuery(
      {
        id: config.repoName
          ? `${config.owner}/${config.repoName}`
          : config.owner,
        path: path,
        ref: config.branch,
        recursive: options?.recursive ?? false,
        config: config,
      },
      { skip: !isGitLab || !config.repoName || options?.skip },
    );

    return isGitLab ? glQuery : ghQuery;
  };

  const useGitContent = (path: string, options?: any) => {
    const isGitLab = isGitLabProvider(config.provider);
    const ghQuery = useGetGitHubContentQuery(
      {
        owner: config.owner,
        repo: config.repoName,
        path: path,
        ref: config.branch,
        parser: options?.parser ?? false,
      },
      { skip: isGitLab || !config.repoName || options?.skip },
    );

    const glQuery = useGetGitLabContentQuery(
      {
        id: config.repoName
          ? `${config.owner}/${config.repoName}`
          : config.owner,
        file_path: path,
        ref: config.branch,
        parser: options?.parser ?? false,
      },
      { skip: !isGitLab || !config.repoName || options?.skip },
    );

    return isGitLab ? glQuery : ghQuery;
  };

  const useGitSiteConfig = (options?: any) => {
    const isGitLab = isGitLabProvider(config.provider);
    const ghQuery = useGetGitHubSiteConfigQuery(
      {
        owner: config.owner,
        repo: config.repoName,
        path: ".sitepins/config.json", // Standard path
        ref: config.branch,
      },
      { skip: isGitLab || !config.repoName || options?.skip },
    );

    const glQuery = useGetGitLabSiteConfigQuery(
      {
        id: config.repoName
          ? `${config.owner}/${config.repoName}`
          : config.owner,
        file_path: ".sitepins/config.json",
        ref: config.branch,
      },
      { skip: !isGitLab || !config.repoName || options?.skip },
    );

    return isGitLab ? glQuery : ghQuery;
  };

  const useGitImage = (path: string, options?: any) => {
    const isGitLab = isGitLabProvider(config.provider);
    const ghQuery = useGetGitHubImageQuery(
      {
        owner: config.owner,
        repo: config.repoName,
        path: path,
        ref: config.branch,
      },
      { skip: isGitLab || !config.repoName || options?.skip },
    );

    const glQuery = useGetGitLabImageQuery(
      {
        id: config.repoName
          ? `${config.owner}/${config.repoName}`
          : config.owner,
        file_path: path,
        ref: config.branch,
      },
      { skip: !isGitLab || !config.repoName || options?.skip },
    );

    return isGitLab ? glQuery : ghQuery;
  };

  const useGitBranches = (options?: any) => {
    const isGitLab = isGitLabProvider(config.provider);

    const ghQuery = useGetGitHubBranchesQuery(
      {
        owner: config.owner,
        repo: config.repoName,
      },
      { skip: isGitLab || !config.repoName || options?.skip },
    );

    const glQuery = useGetGitLabBranchesQuery(
      {
        id: config.repoName
          ? `${config.owner}/${config.repoName}`
          : config.owner,
      },
      { skip: !isGitLab || !config.repoName || options?.skip },
    );

    return isGitLab ? glQuery : ghQuery;
  };

  return {
    provider: config.provider,
    updateFiles,
    deleteFile,
    renameFile,
    useGitTrees,
    useGitContent,
    useGitSiteConfig,
    useGitImage,
    useGitBranches,
    createGhBranch,
    createGlBranch,
    isPending,
    isBranchCreating,
  };
}
