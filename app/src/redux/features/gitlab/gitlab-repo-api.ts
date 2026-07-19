import { encodeProjectPath, gitlabApi } from "./gitlab-api";
import { TGitLabProject } from "./gitlab-type";

/**
 * GitLab Repository API
 *
 * Provides endpoints for GitLab repository/project operations.
 */

export const gitlabRepoApi = gitlabApi.injectEndpoints({
  endpoints: (builder) => ({
    /**
     * Get a single GitLab project (repository)
     */
    getGitLabRepo: builder.query<
      TGitLabProject,
      { owner: string; repo: string }
    >({
      query: ({ owner, repo }) => ({
        endpoint: `/projects/${encodeProjectPath(`${owner}/${repo}`)}`,
      }),
      providesTags: ["GitLabRepos"],
    }),

    /**
     * Create a new GitLab project
     */
    createGitLabRepo: builder.mutation<
      TGitLabProject,
      {
        name: string;
        description?: string;
        visibility?: "private" | "internal" | "public";
        initialize_with_readme?: boolean;
        default_branch?: string;
        namespace_id?: number;
      }
    >({
      query: (body) => ({
        endpoint: "/projects",
        method: "POST",
        body,
      }),
      invalidatesTags: ["GitLabRepos"],
    }),

    /**
     * Fork a GitLab project
     */
    forkGitLabRepo: builder.mutation<
      TGitLabProject,
      {
        id: string | number;
        name?: string;
        path?: string;
        namespace_id?: number;
        namespace_path?: string;
      }
    >({
      query: ({ id, ...body }) => ({
        endpoint: `/projects/${encodeProjectPath(String(id))}/fork`,
        method: "POST",
        body,
      }),
      invalidatesTags: ["GitLabRepos"],
    }),

    /**
     * Delete a GitLab project
     */
    deleteGitLabRepo: builder.mutation<void, { id: string | number }>({
      query: ({ id }) => ({
        endpoint: `/projects/${encodeProjectPath(String(id))}`,
        method: "DELETE",
      }),
      invalidatesTags: ["GitLabRepos"],
    }),

    /**
     * Get projects by namespace/group
     */
    getGitLabGroupProjects: builder.query<
      TGitLabProject[],
      {
        groupId: string | number;
        per_page?: number;
        page?: number;
        include_subgroups?: boolean;
      }
    >({
      query: ({
        groupId,
        per_page = 100,
        page = 1,
        include_subgroups = true,
      }) => ({
        endpoint: `/groups/${encodeProjectPath(String(groupId))}/projects`,
        params: {
          per_page,
          page,
          include_subgroups,
          order_by: "last_activity_at",
          sort: "desc",
        },
      }),
      providesTags: ["GitLabRepos"],
    }),

    /**
     * Compare branches
     */
    compareGitLabBranch: builder.query<
      any,
      { id: string | number; from: string; to: string }
    >({
      query: ({ id, from, to }) => ({
        endpoint: `/projects/${encodeProjectPath(String(id))}/repository/compare`,
        params: { from, to },
      }),
      providesTags: ["GitLabComparison"],
    }),

    /**
     * Create a merge request
     */
    createGitLabMergeRequest: builder.mutation<
      any,
      {
        id: string | number;
        source_branch: string;
        target_branch: string;
        title: string;
        description?: string;
      }
    >({
      query: ({ id, ...body }) => ({
        endpoint: `/projects/${encodeProjectPath(String(id))}/merge_requests`,
        method: "POST",
        body,
      }),
      invalidatesTags: ["GitLabMergeRequests", "GitLabComparison"],
    }),

    /**
     * List merge requests
     */
    getGitLabMergeRequests: builder.query<
      any[],
      {
        id: string | number;
        state?: string;
        source_branch?: string;
        target_branch?: string;
      }
    >({
      query: ({ id, ...params }) => ({
        endpoint: `/projects/${encodeProjectPath(String(id))}/merge_requests`,
        params,
      }),
      providesTags: ["GitLabMergeRequests"],
    }),

    /**
     * Merge a merge request
     */
    mergeGitLabMergeRequest: builder.mutation<
      any,
      {
        id: string | number;
        merge_request_iid: number;
        merge_commit_message?: string;
        squash?: boolean;
        should_remove_source_branch?: boolean;
      }
    >({
      query: ({ id, merge_request_iid, ...body }) => ({
        endpoint: `/projects/${encodeProjectPath(String(id))}/merge_requests/${merge_request_iid}/merge`,
        method: "PUT",
        body,
      }),
      invalidatesTags: ["GitLabMergeRequests"],
    }),
  }),
});

export const {
  useGetGitLabRepoQuery,
  useCreateGitLabRepoMutation,
  useForkGitLabRepoMutation,
  useDeleteGitLabRepoMutation,
  useGetGitLabGroupProjectsQuery,
  useCompareGitLabBranchQuery,
  useCreateGitLabMergeRequestMutation,
  useGetGitLabMergeRequestsQuery,
  useMergeGitLabMergeRequestMutation,
} = gitlabRepoApi;
