import { MdxSnippet } from "@/editor/utils/plate-types";
import { siteConfigPath, snippetFolder } from "@/lib/config-dir";
import { GITLAB_API_VERSION } from "@/lib/constant";
import { logger } from "@/lib/logger";
import { checkMedia } from "@/lib/utils/check-media-file";
import {
  isOldConfigFormat,
  migrateConfig,
  type TLegacyConfig,
} from "@/lib/utils/config-migration";
import { parseContentJson } from "@/lib/utils/content-serializer";
import { fmDetector } from "@/lib/utils/frontmatter-detector";
import { getManifestFile } from "@/lib/utils/manifest";
import { pathToDir } from "@/lib/utils/path-to-dir";
import { RootState, store } from "@/redux/store";
import { TConfig, TFiles, TTree } from "@/types";
import path from "path";
import { updateConfig } from "../config/slice";
import {
  encodeProjectPath,
  gitlabApi,
  type TGitLabQueryArgs,
} from "./gitlab-api";
import { gitlabCommitApi } from "./gitlab-commit-api";
import {
  TGitLabBranch,
  TGitLabFile,
  TGitLabProject,
  TGitLabProjectParams,
  TGitLabTreeItem,
  TGitLabTreeParams,
  TGitLabUser,
} from "./gitlab-type";

/**
 * GitLab Content API
 *
 * Provides endpoints for reading GitLab repository content:
 * - Repository tree
 * - File contents
 * - Branches
 * - User info
 * - Snippets
 */

// ============================================================================
// Helper Functions
// ============================================================================

import { Framework } from "@/lib/utils/framework-detector";
import { parseSnippetFile } from "@/lib/utils/git-utils";

/**
 * Convert GitLab tree items to the TTree format used by the app
 */
function convertGitLabTreeToTTree(items: TGitLabTreeItem[]): TTree[] {
  return items.map((item) => ({
    path: item.path,
    sha: item.id,
    type: item.type === "tree" ? ("tree" as const) : ("blob" as const),
    mode: (item.mode === "040000" ? "040000" : "100644") as
      "100644" | "100755" | "040000" | "160000" | "120000",
    size: item.size,
  }));
}

// ============================================================================
// API Endpoints
// ============================================================================

async function loadGitLabSnippets(
  response: TGitLabTreeItem[] | { message?: string },
  id: string | number,
  ref: string | undefined,
  fetchWithBQ?: (
    args: TGitLabQueryArgs,
  ) =>
    | PromiseLike<{ data?: unknown; error?: unknown }>
    | { data?: unknown; error?: unknown },
): Promise<MdxSnippet[]> {
  if (!Array.isArray(response)) {
    store.dispatch(updateConfig({ snippets: [] }));
    return [];
  }

  const dispatch = store.dispatch;
  const snippetFiles = response.filter((item) => item.type === "blob");

  const snippetResults = await Promise.all<MdxSnippet | null>(
    snippetFiles.map(async (file) => {
      try {
        let decoded = "";
        if (fetchWithBQ) {
          const res = await fetchWithBQ({
            endpoint: `/projects/${encodeProjectPath(String(id))}/repository/files/${encodeURIComponent(file.path)}/raw`,
            params: ref ? { ref } : undefined,
          });
          if (res.error) return null;
          decoded =
            typeof res.data === "string" ? res.data : JSON.stringify(res.data);
        } else {
          const { config } = store.getState();
          const rawUrl = `https://gitlab.com/api/${GITLAB_API_VERSION}/projects/${encodeProjectPath(String(id))}/repository/files/${encodeURIComponent(file.path)}/raw`;
          const fetchUrl = ref
            ? `${rawUrl}?ref=${encodeURIComponent(ref)}`
            : rawUrl;
          const token = config.currentLoginUserToken || config.token;
          const headers: Record<string, string> = {};
          if (token) {
            headers.Authorization = `Bearer ${token}`;
          }
          const fetchResponse = await fetch(fetchUrl, { headers });
          if (!fetchResponse.ok) return null;
          decoded = await fetchResponse.text();
        }

        return parseSnippetFile(decoded, file.path);
      } catch (error) {
        logger.warn("Failed to load snippet", error, {
          filePath: file.path,
        });
        return null;
      }
    }),
  );

  const snippets = snippetResults.filter(
    (snippet): snippet is MdxSnippet => snippet !== null,
  );

  dispatch(updateConfig({ snippets }));

  return snippets;
}

export const gitlabContentApi = gitlabApi.injectEndpoints({
  endpoints: (builder) => ({
    /**
     * Get current authenticated GitLab user
     */
    getGitLabUser: builder.query<TGitLabUser, { token?: string }>({
      query: ({ token }) => ({
        endpoint: "/user",
        token,
      }),
      providesTags: ["GitLabUser"],
    }),

    /**
     * Get a single GitLab project (repository)
     */
    getGitLabProject: builder.query<TGitLabProject, TGitLabProjectParams>({
      query: ({ id }) => ({
        endpoint: `/projects/${encodeProjectPath(String(id))}`,
      }),
      providesTags: ["GitLabRepos"],
    }),

    /**
     * List user's GitLab projects
     */
    getGitLabUserProjects: builder.query<
      TGitLabProject[],
      { membership?: boolean; per_page?: number; page?: number }
    >({
      query: ({ membership = true, per_page = 100, page = 1 }) => ({
        endpoint: "/projects",
        params: {
          membership,
          per_page,
          page,
          order_by: "last_activity_at",
          sort: "desc",
        },
      }),
      providesTags: ["GitLabRepos"],
    }),

    /**
     * Get GitLab repository tree (file listing)
     */
    getGitLabTrees: builder.query<
      {
        trees: TFiles[];
        files: TTree[];
      },
      TGitLabTreeParams & { config: TConfig }
    >({
      queryFn: async (arg, _api, _extraOptions, baseQuery) => {
        const {
          id,
          path: treePath,
          ref,
          recursive = true,
          per_page = 100,
        } = arg;
        const projectPath = encodeProjectPath(String(id));
        let allItems: TGitLabTreeItem[] = [];
        let page = 1;
        let hasNextPage = true;
        const MAX_PAGES = 50; // Safety limit (5000 files)

        while (hasNextPage && page <= MAX_PAGES) {
          const result = await baseQuery({
            endpoint: `/projects/${projectPath}/repository/tree`,
            params: {
              path: treePath,
              ref,
              recursive,
              per_page,
              page,
            },
          });

          if (result.error) {
            return { error: result.error };
          }

          const data = result.data as TGitLabTreeItem[];
          allItems = [...allItems, ...data];

          const headers = result.meta?.headers;
          const nextPage = headers?.["x-next-page"];

          if (nextPage) {
            page = parseInt(nextPage, 10);
          } else {
            hasNextPage = false;
          }
        }

        const trees = convertGitLabTreeToTTree(allItems);
        return {
          data: {
            trees: pathToDir(trees, arg.config),
            files: trees,
          },
        };
      },
      providesTags: [{ type: "GitLabFiles", id: "LIST" }],
    }),

    /**
     * Get GitLab file content
     */
    getGitLabContent: builder.query<
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      any,
      {
        id: string | number;
        file_path: string;
        ref?: string;
        parser?: boolean;
      }
    >({
      query: ({ id, file_path, ref }) => ({
        endpoint: `/projects/${encodeProjectPath(String(id))}/repository/files/${encodeURIComponent(file_path)}`,
        params: { ref, _nocache: Date.now() },
      }),
      providesTags: (_result, _error, arg) => [
        {
          type: "GitLabContent",
          id: `${arg.id}/${arg.ref}/${arg.file_path}/${String(arg.parser)}`,
        },
      ],
      transformResponse(
        response: TGitLabFile | TGitLabTreeItem[],
        _meta,
        arg: {
          id: string | number;
          file_path: string;
          ref?: string;
          parser?: boolean;
        },
      ): Record<string, unknown> {
        // If it's a directory listing, convert to Record
        if (Array.isArray(response)) {
          return { items: response } as Record<string, unknown>;
        }

        const fileData = response as TGitLabFile;

        // Handle media files - return raw base64
        const isMedia = checkMedia(arg.file_path || "");
        if (isMedia) {
          return { data: fileData.content, sha: fileData.blob_id };
        }

        // Decode base64 content
        const decodedContent = Buffer.from(fileData.content, "base64").toString(
          "utf-8",
        );

        if (arg.parser) {
          const fm = fmDetector(decodedContent, path.parse(arg.file_path).ext);
          const parsedContent = parseContentJson(decodedContent, fm);

          let startWith = "---";
          if (decodedContent.startsWith("+++")) {
            startWith = "+++";
          } else if (decodedContent.startsWith("---toml")) {
            startWith = "---toml";
          }

          return {
            ...parsedContent,
            fmType: fm,
            startWith,
            sha: fileData.blob_id,
          };
        }

        return { data: decodedContent, sha: fileData.blob_id };
      },
    }),

    /**
     * Get GitLab raw file content
     */
    getGitLabRawContent: builder.query<
      string,
      {
        id: string | number;
        file_path: string;
        ref?: string;
      }
    >({
      query: ({ id, file_path, ref }) => ({
        endpoint: `/projects/${encodeProjectPath(String(id))}/repository/files/${encodeURIComponent(file_path)}/raw`,
        params: { ref },
      }),
    }),

    /**
     * Get GitLab image/file for display
     */
    getGitLabImage: builder.query<
      { download_url: string; size: number; content?: string; sha?: string },
      {
        id: string | number;
        file_path: string;
        ref?: string;
      }
    >({
      query: ({ id, file_path, ref }) => ({
        endpoint: `/projects/${encodeProjectPath(String(id))}/repository/files/${encodeURIComponent(file_path)}`,
        params: { ref },
      }),
      transformResponse(response: TGitLabFile) {
        return {
          download_url: "",
          size: response.size,
          content: response.content,
          sha: response.blob_id,
        };
      },
    }),

    /**
     * Get GitLab file metadata (HEAD request)
     */
    getGitLabFileMetadata: builder.query<
      number | null,
      {
        id: string | number;
        file_path: string;
        ref?: string;
      }
    >({
      query: ({ id, file_path, ref }) => ({
        endpoint: `/projects/${encodeProjectPath(String(id))}/repository/files/${encodeURIComponent(file_path)}`,
        method: "HEAD",
        params: { ref },
      }),
      transformResponse: (_, meta) => {
        const headers = meta?.headers;
        const sizeHeader = headers?.["x-gitlab-size"];
        if (sizeHeader) {
          return parseInt(sizeHeader, 10);
        }
        return null;
      },
    }),

    /**
     * Get GitLab snippets (from the config folder's snippet/)
     */
    getGitLabSnippets: builder.query<
      MdxSnippet[],
      {
        id: string | number;
        ref?: string;
      }
    >({
      async queryFn({ id, ref }, _api, _extraOptions, fetchWithBQ) {
        const result = await fetchWithBQ({
          endpoint: `/projects/${encodeProjectPath(String(id))}/repository/tree`,
          params: {
            path: snippetFolder(),
            ref,
            per_page: 100,
          },
        });

        if (result.error) {
          // A repo without a snippet folder simply has no snippets.
          if (result.error.status !== 404) return { error: result.error };
          store.dispatch(updateConfig({ snippets: [] }));
          return { data: [] };
        }

        return {
          data: await loadGitLabSnippets(
            result.data as TGitLabTreeItem[] | { message?: string },
            id,
            ref,
            fetchWithBQ,
          ),
        };
      },
      providesTags: (_result, _error, arg) => [
        {
          type: "GitLabContent",
          id: `${arg.id}/${arg.ref}/${snippetFolder()}`,
        },
      ],
    }),

    /**
     * Get GitLab site config (from <config dir>/config.json)
     */
    getGitLabSiteConfig: builder.query<
      Record<string, unknown>,
      {
        id: string | number;
        file_path: string;
        ref?: string;
        framework?: Framework;
      }
    >({
      query: ({ id, file_path, ref }) => ({
        endpoint: `/projects/${encodeProjectPath(String(id))}/repository/files/${encodeURIComponent(file_path)}`,
        params: { ref },
      }),
      async onQueryStarted(arg, { dispatch, queryFulfilled, getState }) {
        try {
          const { data } = await queryFulfilled;

          if (!Array.isArray(data) && isOldConfigFormat(data)) {
            const state = getState() as RootState;
            const framework = arg.framework || state.config.framework;

            const config = data as TLegacyConfig;
            const migrated = migrateConfig(config, framework);
            dispatch(updateConfig(migrated));

            // Auto-persist migrated config to GitLab
            dispatch(
              gitlabCommitApi.endpoints.updateGitLabFiles.initiate({
                id: arg.id,
                branch: arg.ref || "main",
                files: [
                  {
                    path: siteConfigPath(),
                    content: JSON.stringify(migrated, null, 2),
                  },
                  getManifestFile(migrated.public),
                ],
                message: "chore: migrate config to new format",
              }),
            );
          } else if (!Array.isArray(data)) {
            dispatch(updateConfig(data as Partial<TConfig>));
          }
        } catch {
          dispatch(
            updateConfig({
              arrangement: [],
              content: "",
              media: "",
              public: "",
              configs: [],
            }),
          );
        }
      },
      transformResponse(response: TGitLabFile) {
        if (response && response.content) {
          const decodedContent = Buffer.from(
            response.content,
            "base64",
          ).toString("utf-8");
          return JSON.parse(decodedContent);
        }
        return response;
      },
    }),

    /**
     * Create a new branch in GitLab
     */
    createGitLabBranch: builder.mutation<
      TGitLabBranch,
      {
        id: string | number;
        branch: string;
        ref: string;
      }
    >({
      query: ({ id, branch, ref }) => ({
        endpoint: `/projects/${encodeProjectPath(String(id))}/repository/branches`,
        method: "POST",
        body: {
          branch,
          ref,
        },
      }),
      invalidatesTags: ["GitLabBranches"],
    }),
  }),
});

export const {
  useGetGitLabUserQuery,
  useGetGitLabProjectQuery,
  useGetGitLabUserProjectsQuery,
  useGetGitLabTreesQuery,
  useGetGitLabContentQuery,
  useLazyGetGitLabContentQuery,
  useGetGitLabRawContentQuery,
  useGetGitLabImageQuery,
  useGetGitLabSnippetsQuery,
  useGetGitLabSiteConfigQuery,
  useCreateGitLabBranchMutation,
} = gitlabContentApi;
