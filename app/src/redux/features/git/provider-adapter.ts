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
  /** The cached tree result, found via whatever args the subscriber used. */
  selectCachedTree(state: unknown): TreeCache | undefined;
  selectCachedContent(state: unknown, args: QueryArgs): ContentCache | undefined;
  selectCachedContentArgs(state: unknown): QueryArgs[];

  // These dispatch rather than return an action: the thunk RTK Query builds
  // is endpoint-specific, so it cannot be described by one shared union.
  updateTreeCache(
    dispatch: AppDispatch,
    args: QueryArgs,
    recipe: (draft: TreeCache) => void,
  ): void;
  /**
   * Applies `recipe` to every cached tree listing. Use this when the repo
   * itself changed: hand-built args miss the subscriber's entry, because
   * GitLab keys its listings by `path` too.
   */
  updateAllTreeCaches(
    dispatch: AppDispatch,
    state: unknown,
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

  selectCachedTree: (state) => {
    const [args] = githubAdapter.selectCachedTreeArgs(state);
    if (!args) return undefined;
    return githubContentApi.endpoints.getGitHubTrees.select(args as never)(
      state as never,
    )?.data as TreeCache | undefined;
  },

  selectCachedContent: (state, args) =>
    githubContentApi.endpoints.getGitHubContent.select(args as never)(
      state as never,
    )?.data as ContentCache | undefined,

  updateTreeCache: (dispatch, args, recipe) => {
    dispatch(
      githubContentApi.util.updateQueryData(
        "getGitHubTrees",
        args as never,
        recipe as never,
      ),
    );
  },
  updateAllTreeCaches: (dispatch, state, recipe) => {
    for (const args of githubAdapter.selectCachedTreeArgs(state)) {
      githubAdapter.updateTreeCache(dispatch, args, recipe);
    }
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

  selectCachedTree: (state) => {
    const [args] = gitlabAdapter.selectCachedTreeArgs(state);
    if (!args) return undefined;
    return gitlabContentApi.endpoints.getGitLabTrees.select(args as never)(
      state as never,
    )?.data as TreeCache | undefined;
  },

  selectCachedContent: (state, args) =>
    gitlabContentApi.endpoints.getGitLabContent.select(args as never)(
      state as never,
    )?.data as ContentCache | undefined,

  updateTreeCache: (dispatch, args, recipe) => {
    dispatch(
      gitlabContentApi.util.updateQueryData(
        "getGitLabTrees",
        args as never,
        recipe as never,
      ),
    );
  },
  updateAllTreeCaches: (dispatch, state, recipe) => {
    for (const args of gitlabAdapter.selectCachedTreeArgs(state)) {
      gitlabAdapter.updateTreeCache(dispatch, args, recipe);
    }
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
