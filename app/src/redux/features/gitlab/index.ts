/**
 * GitLab API Module
 *
 * Exports all GitLab-related APIs and types for easy importing.
 */

// Base API
export {
  encodeProjectPath,
  gitlabApi,
  useGetGitLabBranchesQuery,
  useGetGitLabRepoTreeQuery,
  useGetGitLabReposQuery,
  useGetGitLabSingleRepoQuery,
  useLazyGetGitLabBranchesQuery,
  useLazyGetGitLabReposQuery,
} from "./gitlab-api";
export type { TGitLabQueryArgs, TGitLabQueryError } from "./gitlab-api";

// Types
export * from "./gitlab-type";

// Content API
export {
  gitlabContentApi,
  useCreateGitLabBranchMutation,
  useGetGitLabContentQuery,
  useGetGitLabImageQuery,
  useGetGitLabProjectQuery,
  useGetGitLabRawContentQuery,
  useGetGitLabSiteConfigQuery,
  useGetGitLabSnippetsQuery,
  useGetGitLabTreesQuery,
  useGetGitLabUserProjectsQuery,
  useGetGitLabUserQuery,
  useLazyGetGitLabContentQuery,
} from "./gitlab-content-api";

// Commit API
export {
  gitlabCommitApi,
  useGetGitLabCommitStatusQuery,
  useGetGitLabCommitsQuery,
  useRenameGitLabFolderMutation,
  useRevertToGitLabCommitMutation,
  useUpdateGitLabFilesMutation,
} from "./gitlab-commit-api";

// Repo API
export {
  gitlabRepoApi,
  useCompareGitLabBranchQuery,
  useCreateGitLabMergeRequestMutation,
  useCreateGitLabRepoMutation,
  useDeleteGitLabRepoMutation,
  useForkGitLabRepoMutation,
  useGetGitLabGroupProjectsQuery,
  useGetGitLabMergeRequestsQuery,
  useGetGitLabRepoQuery,
  useMergeGitLabMergeRequestMutation,
} from "./gitlab-repo-api";
