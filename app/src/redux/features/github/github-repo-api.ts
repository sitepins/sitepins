import { githubApi } from "./github-api";
import type { TGitHubPromise } from "./github-type";

/**
 * GitHub Repository API
 *
 * Injects repository-related endpoints into the githubApi.
 */
export const githubRepoApi = githubApi.injectEndpoints({
  endpoints: (builder) => ({
    /**
     * Get repository details
     */
    getGitHubRepo: builder.query<
      TGitHubPromise<"GET /repos/{owner}/{repo}">,
      { owner: string; repo: string }
    >({
      query: ({ owner, repo }) => ({
        endpoint: "GET /repos/{owner}/{repo}",
        options: { owner, repo },
      }),
    }),

    /**
     * Compare two branches
     */
    compareGitHubBranch: builder.query<
      TGitHubPromise<"GET /repos/{owner}/{repo}/compare/{basehead}">,
      { owner: string; repo: string; base: string; head: string }
    >({
      query: ({ owner, repo, base, head }) => ({
        endpoint: "GET /repos/{owner}/{repo}/compare/{base}...{head}",
        options: { owner, repo, base, head },
      }),
      providesTags: ["GitHubComparison"],
    }),

    /**
     * Create a pull request
     */
    createGitHubPullRequest: builder.mutation<
      TGitHubPromise<"POST /repos/{owner}/{repo}/pulls">,
      {
        owner: string;
        repo: string;
        title: string;
        body?: string;
        head: string;
        base: string;
      }
    >({
      query: (options) => ({
        endpoint: "POST /repos/{owner}/{repo}/pulls",
        options,
      }),
      invalidatesTags: [
        "GitHubPulls",
        "GitHubComparison",
        "GitHubContent",
        { type: "GitHubFiles", id: "LIST" },
      ],
    }),

    /**
     * List pull requests
     */
    getGitHubPullRequests: builder.query<
      TGitHubPromise<"GET /repos/{owner}/{repo}/pulls">,
      {
        owner: string;
        repo: string;
        head?: string;
        base?: string;
        state?: string;
      }
    >({
      query: (options) => ({
        endpoint: "GET /repos/{owner}/{repo}/pulls",
        options,
      }),
      providesTags: ["GitHubPulls"],
    }),

    /**
     * Merge a pull request
     */
    mergeGitHubPullRequest: builder.mutation<
      TGitHubPromise<"PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge">,
      {
        owner: string;
        repo: string;
        pull_number: number;
        commit_title?: string;
        commit_message?: string;
        merge_method?: "merge" | "squash" | "rebase";
      }
    >({
      query: ({ owner, repo, pull_number, ...options }) => ({
        endpoint: "PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge",
        options: { owner, repo, pull_number, ...options },
      }),
      invalidatesTags: [
        "GitHubPulls",
        "GitHubComparison",
        "GitHubBranches",
        "GitHubContent",
        { type: "GitHubFiles", id: "LIST" },
      ],
    }),
  }),
});

export const {
  useGetGitHubRepoQuery,
  useCompareGitHubBranchQuery,
  useCreateGitHubPullRequestMutation,
  useGetGitHubPullRequestsQuery,
  useMergeGitHubPullRequestMutation,
} = githubRepoApi;
