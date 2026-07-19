import { GITHUB_API_VERSION, IS_DEMO } from "@/lib/constant";
import { isGitHubProvider } from "@/lib/utils/provider-checker";
import { RootState } from "@/redux/store";
import { Octokit } from "@octokit/rest";
import { BaseQueryFn } from "@reduxjs/toolkit/query";
import { createApi } from "@reduxjs/toolkit/query/react";
import { updateConfig } from "../config/slice";
import { TGitHubOption, TGitHubPromise } from "./github-type";

/**
 * GitHub API Base Query
 *
 * A custom base query function for RTK Query that handles GitHub API requests
 * using Octokit.
 */

export type TGitHubQueryArgs = {
  endpoint: string;
  options?: any;
};

export type TGitHubQueryError = {
  status: number;
  message: string;
};

let refreshPromise: Promise<any> | null = null;

const octokitBaseQuery: BaseQueryFn<
  TGitHubQueryArgs,
  unknown,
  TGitHubQueryError
> = async ({ endpoint, options }, { getState, dispatch }) => {
  if (IS_DEMO && endpoint && !endpoint.startsWith("GET")) {
    return {
      error: {
        status: 403,
        message: "Demo mode: changes are not saved.",
      },
    };
  }

  try {
    const { config } = getState() as RootState;
    const {
      token: optionToken,
      headers: optionHeaders,
      ...restOptions
    } = options || {};

    let authToken =
      optionToken || config.currentLoginUserToken || config.token || undefined;

    // Token refresh logic
    if (
      !optionToken &&
      config.refreshToken &&
      isGitHubProvider(config.provider)
    ) {
      const expiresAtValue = config.accessTokenExpiresAt;
      const expiresAt =
        typeof expiresAtValue === "number"
          ? expiresAtValue
          : expiresAtValue
            ? new Date(expiresAtValue).getTime()
            : 0;

      // Refresh if expiring in less than 5 minutes (300,000 ms) or already expired
      const shouldRefresh = expiresAt > 0 && Date.now() >= expiresAt - 300000;

      if (shouldRefresh) {
        if (!refreshPromise) {
          console.log("GitHub token expiring/expired, refreshing...");
          refreshPromise = fetch("/api/auth/github/refresh", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refresh_token: config.refreshToken }),
          })
            .then((res) => {
              if (!res.ok) throw new Error("Refresh failed");
              return res.json();
            })
            .then((data) => {
              console.log("GitHub token refreshed via baseQuery");
              dispatch(
                updateConfig({
                  token: data.access_token,
                  currentLoginUserToken: data.access_token,
                  refreshToken: data.refresh_token,
                  accessTokenExpiresAt: data.access_token_expires_at,
                  refreshTokenExpiresAt: data.refresh_token_expires_at,
                  lastRefreshedAt: data.last_refreshed_at,
                }),
              );
              return data.access_token;
            })
            .catch((err) => {
              console.error("Token refresh failed:", err);
              return null;
            })
            .finally(() => {
              refreshPromise = null;
            });
        }

        const newAccessToken = await refreshPromise;
        if (newAccessToken) {
          authToken = newAccessToken;
        }
      }
    }

    if (!authToken) {
      return {
        error: {
          status: 401,
          message: "No authentication token available",
        },
      };
    }
    const baseOctokit = new Octokit({
      auth: authToken,
      request: {
        fetch: fetch,
      },
      // log: {
      //   warn: () => {},
      //   info: () => {},
      //   debug: () => {},
      //   error: console.error,
      // },
    });

    const request = baseOctokit.request.defaults({
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
        ...(optionHeaders || {}),
      },
    });

    const response = await request(endpoint, restOptions);

    return { data: response.data };
  } catch (error: any) {
    return {
      error: {
        status: error.status || error.response?.status || 500,
        message: error.message || "An error occurred",
      },
    };
  }
};

/**
 * GitHub API
 *
 * RTK Query API for GitHub REST API endpoints.
 * Uses Octokit for authentication and request handling.
 */
export const githubApi = createApi({
  reducerPath: "githubApi",
  baseQuery: octokitBaseQuery,
  tagTypes: [
    "GitHubCommit",
    "GitHubFiles",
    "GitHubInstallations",
    "GitHubUser",
    "GitHubContent",
    "GitHubPulls",
    "GitHubComparison",
    "GitHubBranches",
    "GitHubCommitStatus",
  ],
  endpoints: (builder) => ({
    getGitHubBranches: builder.query<
      TGitHubPromise<"GET /repos/{owner}/{repo}/branches">,
      TGitHubOption<"GET /repos/{owner}/{repo}/branches">
    >({
      query: (options) => ({
        endpoint: "GET /repos/{owner}/{repo}/branches",
        options: { ...options, per_page: 100 },
      }),
      providesTags: ["GitHubBranches"],
    }),

    getGitHubSingleRepo: builder.query<
      TGitHubPromise<"GET /repos/{owner}/{repo}">,
      TGitHubOption<"GET /repos/{owner}/{repo}">
    >({
      query: ({ owner, repo }) => ({
        endpoint: "GET /repos/{owner}/{repo}",
        options: { owner, repo },
      }),
    }),

    getGitHubUserRepos: builder.query<
      TGitHubPromise<"GET /users/{username}/repos">,
      TGitHubOption<"GET /users/{username}/repos">
    >({
      query: ({ username }) => ({
        endpoint: "GET /users/{username}/repos",
        options: { username },
      }),
    }),

    searchGitHubRepos: builder.query<
      { items: any[] },
      { q: string; per_page?: number; page?: number }
    >({
      query: (options) => ({
        endpoint: "GET /search/repositories",
        options,
      }),
    }),
  }),
});

export const {
  useGetGitHubBranchesQuery,
  useGetGitHubSingleRepoQuery,
  useGetGitHubUserReposQuery,
  useLazySearchGitHubReposQuery,
} = githubApi;
