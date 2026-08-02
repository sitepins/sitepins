import { selectConfig } from "@/redux/features/config/slice";
import {
  CommitsQueryOptions,
  getGitProviderAdapter,
  gitProviderAdapters,
  TreeQueryOptions,
} from "@/redux/features/git/provider-adapter";
import {
  useCreateNewGitHubBranchRefMutation,
  useGetGitHubBranchesQuery,
  useGetGitHubCommitStatusQuery,
  useGetGitHubCommitsQuery,
  useGetGitHubContentQuery,
  useGetGitHubImageQuery,
  useGetGitHubSiteConfigQuery,
  useGetGitHubTreesQuery,
  useUpdateGitHubFilesMutation,
} from "@/redux/features/github";
import {
  useCreateGitLabBranchMutation,
  useGetGitLabBranchesQuery,
  useGetGitLabCommitStatusQuery,
  useGetGitLabCommitsQuery,
  useGetGitLabContentQuery,
  useGetGitLabImageQuery,
  useGetGitLabSiteConfigQuery,
  useGetGitLabTreesQuery,
  useUpdateGitLabFilesMutation,
} from "@/redux/features/gitlab";
import { useAppSelector } from "@/redux/store";
import { useCallback } from "react";

const SITE_CONFIG_PATH = ".sitepins/config.json";

const { github: gh, gitlab: gl } = gitProviderAdapters;

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

interface QueryOptions {
  skip?: boolean;
}

interface ContentOptions extends QueryOptions {
  parser?: boolean;
}

interface TreeOptions extends QueryOptions, TreeQueryOptions {}

interface CommitsOptions extends QueryOptions, CommitsQueryOptions {}

interface CommitStatusOptions extends QueryOptions {
  commitRef?: string;
  pollingInterval?: number;
}

interface SiteConfigOptions extends QueryOptions {
  framework?: string;
  refetchOnMountOrArgChange?: boolean;
}

interface CreateBranchOptions {
  /** Name of the new branch. */
  name: string;
  /**
   * Branches already fetched by the caller. GitHub needs the base branch's
   * commit sha; the two providers return different branch shapes, so this
   * stays untyped and is narrowed on read.
   */
  branches?: readonly unknown[];
}

const baseShaOf = (
  branches: readonly unknown[] | undefined,
  branchName: string,
): string | undefined => {
  const match = branches?.find(
    (branch) => (branch as { name?: unknown })?.name === branchName,
  ) as { commit?: { sha?: unknown } } | undefined;
  const sha = match?.commit?.sha;
  return typeof sha === "string" ? sha : undefined;
};

export function useGitProvider() {
  const config = useAppSelector(selectConfig);
  const adapter = getGitProviderAdapter(config.provider);
  const isGitLab = adapter.id === "gitlab";

  const [updateGitHubFiles, { isLoading: isGitHubPending }] =
    useUpdateGitHubFilesMutation();
  const [updateGitLabFiles, { isLoading: isGitLabPending }] =
    useUpdateGitLabFilesMutation();

  const [createGhBranch, { isLoading: isGhBranchCreating }] =
    useCreateNewGitHubBranchRefMutation();
  const [createGlBranch, { isLoading: isGlBranchCreating }] =
    useCreateGitLabBranchMutation();

  const isPending = isGitLab ? isGitLabPending : isGitHubPending;
  const isBranchCreating = isGitLab ? isGlBranchCreating : isGhBranchCreating;

  const updateFiles = useCallback(
    async (options: UpdateFilesOptions) => {
      if (isGitLab) {
        return updateGitLabFiles({
          id: gl.repoId(config),
          branch: config.branch,
          files: options.files,
          message: options.message,
          description: options.description,
        });
      }
      return updateGitHubFiles({
        owner: config.owner,
        repo: config.repoName,
        tree: config.branch,
        files: options.files,
        message: options.message,
        description: options.description,
      });
    },
    [config, isGitLab, updateGitHubFiles, updateGitLabFiles],
  );

  const deleteFile = useCallback(
    async (path: string, message: string) =>
      updateFiles({ files: [{ path, delete: true }], message }),
    [updateFiles],
  );

  const renameFile = useCallback(
    async (
      oldPath: string,
      newPath: string,
      content: string,
      message: string,
    ) =>
      updateFiles({
        files: [
          { path: oldPath, delete: true },
          { path: newPath, content },
        ],
        message,
      }),
    [updateFiles],
  );

  /**
   * GitLab branches off a ref by name; GitHub needs the base branch's commit
   * sha, which the caller already has from `useGitBranches`.
   */
  const createBranch = useCallback(
    async ({ name, branches }: CreateBranchOptions) => {
      if (isGitLab) {
        return createGlBranch({
          id: gl.repoId(config),
          branch: name,
          ref: config.branch,
        }).unwrap();
      }

      const baseSha = baseShaOf(branches, config.branch);
      if (!baseSha) {
        throw new Error("MISSING_BASE_SHA");
      }

      return createGhBranch({
        owner: config.owner,
        repo: config.repoName,
        ref: `refs/heads/${name}`,
        sha: baseSha,
      }).unwrap();
    },
    [config, createGhBranch, createGlBranch, isGitLab],
  );

  // Both provider hooks always run — hooks cannot be called conditionally —
  // but only the active provider's query is unskipped. Arguments come from the
  // matching adapter so request shapes stay in one place.
  const isDisabled = !config.repoName;

  const useGitTrees = (path: string, options?: TreeOptions) => {
    const ghQuery = useGetGitHubTreesQuery(
      gh.treesArgs(config, path, options) as never,
      { skip: isGitLab || isDisabled || options?.skip },
    );
    const glQuery = useGetGitLabTreesQuery(
      gl.treesArgs(config, path, options) as never,
      { skip: !isGitLab || isDisabled || options?.skip },
    );
    return isGitLab ? glQuery : ghQuery;
  };

  const useGitContent = (path: string, options?: ContentOptions) => {
    const contentOptions = { parser: options?.parser ?? false };
    const ghQuery = useGetGitHubContentQuery(
      gh.contentArgs(config, path, contentOptions) as never,
      { skip: isGitLab || isDisabled || options?.skip },
    );
    const glQuery = useGetGitLabContentQuery(
      gl.contentArgs(config, path, contentOptions) as never,
      { skip: !isGitLab || isDisabled || options?.skip },
    );
    return isGitLab ? glQuery : ghQuery;
  };

  const useGitSiteConfig = (options?: SiteConfigOptions) => {
    const ghQuery = useGetGitHubSiteConfigQuery(
      gh.siteConfigArgs(config, SITE_CONFIG_PATH, options?.framework) as never,
      {
        skip: isGitLab || isDisabled || options?.skip,
        refetchOnMountOrArgChange: options?.refetchOnMountOrArgChange,
      },
    );
    const glQuery = useGetGitLabSiteConfigQuery(
      gl.siteConfigArgs(config, SITE_CONFIG_PATH, options?.framework) as never,
      {
        skip: !isGitLab || isDisabled || options?.skip,
        refetchOnMountOrArgChange: options?.refetchOnMountOrArgChange,
      },
    );
    return isGitLab ? glQuery : ghQuery;
  };

  const useGitImage = (path: string, options?: QueryOptions) => {
    const ghQuery = useGetGitHubImageQuery(
      gh.imageArgs(config, path) as never,
      {
        skip: isGitLab || isDisabled || options?.skip,
      },
    );
    const glQuery = useGetGitLabImageQuery(
      gl.imageArgs(config, path) as never,
      {
        skip: !isGitLab || isDisabled || options?.skip,
      },
    );
    return isGitLab ? glQuery : ghQuery;
  };

  const useGitCommits = (options?: CommitsOptions) => {
    const ghQuery = useGetGitHubCommitsQuery(
      gh.commitsArgs(config, options) as never,
      { skip: isGitLab || isDisabled || options?.skip },
    );
    const glQuery = useGetGitLabCommitsQuery(
      gl.commitsArgs(config, options) as never,
      { skip: !isGitLab || isDisabled || options?.skip },
    );
    return isGitLab ? glQuery : ghQuery;
  };

  /** Omit `commitRef` to poll the branch head's status. */
  const useGitCommitStatus = (options?: CommitStatusOptions) => {
    const ghQuery = useGetGitHubCommitStatusQuery(
      gh.commitStatusArgs(config, options?.commitRef) as never,
      {
        skip: isGitLab || isDisabled || options?.skip,
        pollingInterval: options?.pollingInterval,
      },
    );
    const glQuery = useGetGitLabCommitStatusQuery(
      gl.commitStatusArgs(config, options?.commitRef) as never,
      {
        skip: !isGitLab || isDisabled || options?.skip,
        pollingInterval: options?.pollingInterval,
      },
    );
    return isGitLab ? glQuery : ghQuery;
  };

  const useGitBranches = (options?: QueryOptions) => {
    const ghQuery = useGetGitHubBranchesQuery(
      gh.branchesArgs(config) as never,
      {
        skip: isGitLab || isDisabled || options?.skip,
      },
    );
    const glQuery = useGetGitLabBranchesQuery(
      gl.branchesArgs(config) as never,
      {
        skip: !isGitLab || isDisabled || options?.skip,
      },
    );
    return isGitLab ? glQuery : ghQuery;
  };

  return {
    provider: config.provider,
    adapter,
    updateFiles,
    deleteFile,
    renameFile,
    createBranch,
    useGitTrees,
    useGitContent,
    useGitSiteConfig,
    useGitImage,
    useGitBranches,
    useGitCommits,
    useGitCommitStatus,
    isPending,
    isBranchCreating,
  };
}
