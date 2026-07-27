/**
 * GitHub API Feature Module
 *
 * This module exports all GitHub REST API-related functionality
 * including base API, content operations, commit operations, and repository operations.
 */

// Base API
export {
  githubApi,
  useGetGitHubBranchesQuery,
  useGetGitHubSingleRepoQuery,
  useGetGitHubUserReposQuery,
  useLazySearchGitHubReposQuery,
} from "./github-api";

// Types
export * from "./github-type";

// Content API
export {
  githubContentApi,
  useAddGitHubRepoMutation,
  useCreateNewGitHubBranchRefMutation,
  useGetGitHubContentQuery,
  useGetGitHubImageQuery,
  useGetGitHubInstallationQuery,
  useGetGitHubInstallationsQuery,
  useGetGitHubReposByInstallationIdQuery,
  useGetGitHubSiteConfigQuery,
  useGetGitHubSnippetsQuery,
  useGetGitHubTreesQuery,
  useGetGitHubUserNameQuery,
  useLazyGetGitHubContentQuery,
  useLazyGetGitHubReposByInstallationIdQuery,
} from "./github-content-api";

// Commit API
export {
  githubCommitApi,
  useGetGitHubCommitsQuery,
  useGetGitHubCommitStatusQuery,
  useRenameGitHubFolderMutation,
  useRevertGitHubCommitMutation,
  useRevertToGitHubCommitMutation,
  useUpdateGitHubFilesMutation,
} from "./github-commit-api";

// Repo API
export {
  githubRepoApi,
  useCompareGitHubBranchQuery,
  useCreateGitHubPullRequestMutation,
  useGetGitHubPullRequestsQuery,
  useGetGitHubRepoQuery,
  useMergeGitHubPullRequestMutation,
} from "./github-repo-api";
