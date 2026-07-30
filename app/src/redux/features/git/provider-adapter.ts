import type { AppDispatch } from "@/redux/store";
import { githubApi, githubContentApi } from "../github";
import { gitlabApi, gitlabContentApi } from "../gitlab";
import {
  ContentCache,
  DirectoryMutator,
  getGitProviderArgs,
  GitProviderArgs,
  gitProviderArgs,
  QueryArgs,
  TreeCache,
} from "./provider-args";

/**
 * Binds the provider argument shapes to this app's RTK Query slices, so
 * callers issue one cache operation instead of branching on the provider.
 */

export * from "./provider-args";

export type GitProviderAdapter = GitProviderArgs & {
  selectCachedTreeArgs(state: unknown): QueryArgs[];
  selectCachedContentArgs(state: unknown): QueryArgs[];

  // These dispatch rather than return an action: the thunk RTK Query builds
  // is endpoint-specific, so it cannot be described by one shared union.
  updateTreeCache(
    dispatch: AppDispatch,
    args: QueryArgs,
    recipe: (draft: TreeCache) => void,
  ): void;
  /**
   * GitHub caches a directory listing as a bare array (replaced by the
   * returned value); GitLab nests it under `items` (mutated in place).
   */
  updateDirectoryCache(
    dispatch: AppDispatch,
    args: QueryArgs,
    mutate: DirectoryMutator,
  ): void;
  /** Optimistically patch one file's cached content entry. */
  updateContentCache(
    dispatch: AppDispatch,
    args: QueryArgs,
    recipe: (draft: ContentCache) => void,
  ): void;
  /** Force-fetch one file's content, bypassing the cache. */
  fetchContent(dispatch: AppDispatch, args: QueryArgs): Promise<ContentCache>;
  invalidateCommit(dispatch: AppDispatch, id: string): void;
};

const githubAdapter: GitProviderAdapter = {
  ...gitProviderArgs.github,

  selectCachedTreeArgs: (state) =>
    githubContentApi.util.selectCachedArgsForQuery(
      state as never,
      "getGitHubTrees",
    ) as unknown as QueryArgs[],
  selectCachedContentArgs: (state) =>
    githubContentApi.util.selectCachedArgsForQuery(
      state as never,
      "getGitHubContent",
    ) as unknown as QueryArgs[],

  updateTreeCache: (dispatch, args, recipe) => {
    dispatch(
      githubContentApi.util.updateQueryData(
        "getGitHubTrees",
        args as never,
        recipe as never,
      ),
    );
  },
  updateDirectoryCache: (dispatch, args, mutate) => {
    dispatch(
      githubContentApi.util.updateQueryData(
        "getGitHubContent",
        args as never,
        ((draft: unknown) =>
          gitProviderArgs.github.updateDirectoryListing(
            draft,
            mutate,
          )) as never,
      ),
    );
  },
  updateContentCache: (dispatch, args, recipe) => {
    dispatch(
      githubContentApi.util.updateQueryData(
        "getGitHubContent",
        args as never,
        recipe as never,
      ),
    );
  },
  fetchContent: (dispatch, args) =>
    dispatch(
      githubContentApi.endpoints.getGitHubContent.initiate(args as never, {
        forceRefetch: true,
      }),
    ).unwrap() as Promise<ContentCache>,
  invalidateCommit: (dispatch, id) => {
    dispatch(githubApi.util.invalidateTags([{ type: "GitHubCommit", id }]));
  },
};

const gitlabAdapter: GitProviderAdapter = {
  ...gitProviderArgs.gitlab,

  selectCachedTreeArgs: (state) =>
    gitlabContentApi.util.selectCachedArgsForQuery(
      state as never,
      "getGitLabTrees",
    ) as unknown as QueryArgs[],
  selectCachedContentArgs: (state) =>
    gitlabContentApi.util.selectCachedArgsForQuery(
      state as never,
      "getGitLabContent",
    ) as unknown as QueryArgs[],

  updateTreeCache: (dispatch, args, recipe) => {
    dispatch(
      gitlabContentApi.util.updateQueryData(
        "getGitLabTrees",
        args as never,
        recipe as never,
      ),
    );
  },
  updateDirectoryCache: (dispatch, args, mutate) => {
    dispatch(
      gitlabContentApi.util.updateQueryData(
        "getGitLabContent",
        args as never,
        ((draft: unknown) => {
          gitProviderArgs.gitlab.updateDirectoryListing(draft, mutate);
        }) as never,
      ),
    );
  },
  updateContentCache: (dispatch, args, recipe) => {
    dispatch(
      gitlabContentApi.util.updateQueryData(
        "getGitLabContent",
        args as never,
        recipe as never,
      ),
    );
  },
  fetchContent: (dispatch, args) =>
    dispatch(
      gitlabContentApi.endpoints.getGitLabContent.initiate(args as never, {
        forceRefetch: true,
      }),
    ).unwrap() as Promise<ContentCache>,
  invalidateCommit: (dispatch, id) => {
    dispatch(gitlabApi.util.invalidateTags([{ type: "GitLabCommit", id }]));
  },
};

export const gitProviderAdapters: Record<
  GitProviderArgs["id"],
  GitProviderAdapter
> = {
  github: githubAdapter,
  gitlab: gitlabAdapter,
};

export const getGitProviderAdapter = (
  provider: string | null | undefined,
): GitProviderAdapter => gitProviderAdapters[getGitProviderArgs(provider).id];
