import { GITLAB_API_VERSION, IS_DEMO } from "@/lib/constant";
import { isGitLabProvider } from "@/lib/utils/provider-checker";
import { RootState } from "@/redux/store";
import { BaseQueryFn } from "@reduxjs/toolkit/query";
import { createApi } from "@reduxjs/toolkit/query/react";
import { updateConfig } from "../config/slice";
import { TGitLabBranch, TGitLabBranchParams } from "./gitlab-type";

/**
 * GitLab API Base Query
 *
 * A custom base query function for RTK Query that handles GitLab API requests.
 * Uses native fetch with PRIVATE-TOKEN authentication header.
 */

export type TGitLabQueryArgs = {
  /** The API endpoint path (e.g., "/projects/:id/repository/tree") */
  endpoint: string;
  /** HTTP method */
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD";
  /** Request body for POST/PUT/PATCH requests */
  body?: Record<string, unknown>;
  /** Query parameters */
  params?: Record<string, string | number | boolean | undefined>;
  /** Optional override for auth token */
  token?: string;
  /** Optional custom headers */
  headers?: Record<string, string>;
};

export type TGitLabQueryError = {
  status: number;
  message: string;
  error?: string;
};

const GITLAB_API_BASE_URL = `https://gitlab.com/api/${GITLAB_API_VERSION}`;

/**
 * URL-encode a project path for use in GitLab API endpoints
 * GitLab requires project paths to be URL-encoded (e.g., "namespace/project" -> "namespace%2Fproject")
 */
export function encodeProjectPath(projectPath: string): string {
  return encodeURIComponent(projectPath);
}

/**
 * Build URL with query parameters
 */
function buildUrl(
  endpoint: string,
  params?: Record<string, string | number | boolean | undefined>,
): string {
  const url = new URL(`${GITLAB_API_BASE_URL}${endpoint}`);

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, String(value));
      }
    });
  }

  return url.toString();
}

let refreshPromise: Promise<any> | null = null;

const gitlabBaseQuery: BaseQueryFn<
  TGitLabQueryArgs,
  unknown,
  TGitLabQueryError
> = async (
  {
    endpoint,
    method = "GET",
    body,
    params,
    token: optionToken,
    headers: optionHeaders,
  },
  { getState, dispatch },
) => {
  if (IS_DEMO && method && method !== "GET") {
    return {
      error: {
        status: 403,
        message: "Demo mode: changes are not saved.",
      },
    };
  }

  try {
    const { config } = getState() as RootState;

    // Use provided token, or fall back to config tokens
    let authToken =
      optionToken || config.currentLoginUserToken || config.token || undefined;

    // Token refresh logic
    // Only attempt refresh if we have a refresh_token and not using an override optionToken
    if (
      !optionToken &&
      config.refreshToken &&
      isGitLabProvider(config.provider)
    ) {
      const expiresAtValue = config.accessTokenExpiresAt;
      const expiresAt =
        typeof expiresAtValue === "number"
          ? expiresAtValue
          : expiresAtValue
            ? new Date(expiresAtValue).getTime()
            : 0;

      // Refresh if expiring in less than 5 minutes (300,000 ms) or already expired
      // But only if we have some minimal valid data (expiresAt > 0)
      const shouldRefresh = expiresAt > 0 && Date.now() >= expiresAt - 300000;

      if (shouldRefresh) {
        if (!refreshPromise) {
          console.log("GitLab token expiring/expired, refreshing...");
          refreshPromise = fetch("/api/auth/gitlab/refresh", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refresh_token: config.refreshToken }),
          })
            .then((res) => {
              if (!res.ok) throw new Error("Refresh failed");
              return res.json();
            })
            .then((data) => {
              console.log("GitLab token refreshed via baseQuery");
              // Update store
              dispatch(
                updateConfig({
                  token: data.access_token, // Update the main token field too if that's what's used
                  currentLoginUserToken: data.access_token, // Usually this is the one
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
              // If refresh fails, we might still try the request with old token
              // or just let it fail. Clearing refreshPromise is important.
              return null;
            })
            .finally(() => {
              refreshPromise = null;
            });
        }

        // Wait for refresh to complete
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

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
      ...(optionHeaders || {}),
    };

    const url = buildUrl(endpoint, params);

    const fetchOptions: RequestInit = {
      method,
      headers,
    };

    if (body && (method === "POST" || method === "PUT" || method === "PATCH")) {
      fetchOptions.body = JSON.stringify(body);
    }

    const response = await fetch(url, fetchOptions);

    // Handle HEAD requests (no body)
    if (method === "HEAD") {
      if (!response.ok) {
        return {
          error: {
            status: response.status,
            message: `GitLab API error: ${response.status}`,
          },
        };
      }

      return {
        data: null,
        meta: {
          headers: Object.fromEntries(response.headers.entries()),
        },
      };
    }

    // Handle non-JSON responses (e.g., raw file content)
    const contentType = response.headers.get("content-type");
    let data: unknown;

    if (contentType?.includes("application/json")) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    if (!response.ok) {
      const errorData = data as { message?: string; error?: string };
      // Check for 401 and maybe force logout or retry if we didn't just refresh?
      // For now, just return error.
      return {
        error: {
          status: response.status,
          message:
            errorData?.message ||
            errorData?.error ||
            `GitLab API error: ${response.status}`,
          error: errorData?.error,
        },
      };
    }

    return {
      data,
      meta: {
        headers: Object.fromEntries(response.headers.entries()),
      },
    };
  } catch (error: unknown) {
    const err = error as Error;
    return {
      error: {
        status: 500,
        message: err.message || "An error occurred while calling GitLab API",
      },
    };
  }
};

/**
 * GitLab API
 *
 * RTK Query API for GitLab REST API endpoints.
 * Uses PRIVATE-TOKEN authentication and the GitLab v4 API.
 */
export const gitlabApi = createApi({
  reducerPath: "gitlabApi",
  baseQuery: gitlabBaseQuery,
  tagTypes: [
    "GitLabCommit",
    "GitLabFiles",
    "GitLabUser",
    "GitLabContent",
    "GitLabBranches",
    "GitLabRepos",
    "GitLabTree",
    "GitLabMergeRequests",
    "GitLabComparison",
    "GitLabCommitStatus",
  ],
  endpoints: (builder) => ({
    getGitLabRepos: builder.query<
      any[],
      {
        token?: string;
        search?: string;
        per_page?: number;
        page?: number;
      } | void
    >({
      query: (args) => {
        const { token, search, per_page = 100, page = 1 } = args || {};
        return {
          endpoint: "/projects",
          params: {
            membership: true,
            order_by: "updated_at",
            search,
            per_page,
            page,
          },
          token: token,
        };
      },
      providesTags: ["GitLabRepos"],
    }),

    // Merged getBranches from gitlab-api.ts and getGitLabBranches from gitlab-content-api.ts
    getGitLabBranches: builder.query<TGitLabBranch[], TGitLabBranchParams>({
      query: ({ id, search, per_page = 100, page = 1, token }) => ({
        endpoint: `/projects/${encodeURIComponent(String(id))}/repository/branches`,
        params: {
          search,
          per_page,
          page,
        },
        token: token,
      }),
      providesTags: ["GitLabBranches"],
    }),

    getGitLabSingleRepo: builder.query<
      any,
      { projectId: string | number; token?: string }
    >({
      query: ({ projectId, token }) => ({
        endpoint: `/projects/${encodeURIComponent(projectId)}`,
        token: token,
      }),
      providesTags: ["GitLabRepos"],
    }),

    getGitLabRepoTree: builder.query<
      any,
      {
        projectId: string | number;
        path?: string;
        ref?: string;
        recursive?: boolean;
        token?: string;
      }
    >({
      query: ({ projectId, path, ref, recursive, token }) => ({
        endpoint: `/projects/${encodeURIComponent(projectId)}/repository/tree`,
        params: {
          path,
          ref,
          recursive,
          per_page: 100,
        },
        token: token,
      }),
      providesTags: ["GitLabTree"],
    }),
  }),
});

export const {
  useGetGitLabReposQuery,
  useLazyGetGitLabReposQuery,
  useGetGitLabBranchesQuery,
  useLazyGetGitLabBranchesQuery,
  useGetGitLabSingleRepoQuery,
  useGetGitLabRepoTreeQuery,
} = gitlabApi;
