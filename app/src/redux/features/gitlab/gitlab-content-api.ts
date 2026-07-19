import { MdxSnippet } from "@/editor/utils/plate-types";
import { GITLAB_API_VERSION, SNIPPET_FOLDER } from "@/lib/constant";
import { checkMedia } from "@/lib/utils/check-media-file";
import {
  getManifestFile,
  isOldConfigFormat,
  migrateConfig,
} from "@/lib/utils/config-migration";
import { parseContentJson } from "@/lib/utils/content-serializer";
import { fmDetector } from "@/lib/utils/frontmatter-detector";
import { pathToDir } from "@/lib/utils/path-to-dir";
import { store } from "@/redux/store";
import { TConfig, TFiles, TTree } from "@/types";
import path from "path";
import { TFileMetaCacheEntry, upsertFileMetadata } from "../config/meta-slice";
import { updateConfig } from "../config/slice";
import { encodeProjectPath, gitlabApi } from "./gitlab-api";
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
      | "100644"
      | "100755"
      | "040000"
      | "160000"
      | "120000",
    size: (item as any).size,
  }));
}

// ============================================================================
// API Endpoints
// ============================================================================

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
            return { error: result.error as any };
          }

          const data = result.data as TGitLabTreeItem[];
          allItems = [...allItems, ...data];

          const headers = (result.meta as any)?.headers as Record<
            string,
            string
          >;
          const nextPage = headers?.["x-next-page"];

          if (nextPage) {
            page = parseInt(nextPage, 10);
          } else {
            hasNextPage = false;
          }
        }

        // --- Transformation Logic (formerly transformResponse) ---
        const response = allItems;

        if (response.length > 200) {
          const trees = convertGitLabTreeToTTree(response);
          return {
            data: {
              trees: pathToDir(trees as any, arg.config),
              files: trees,
            },
          };
        }

        const dispatch = store.dispatch;
        const state = store.getState();
        const metadataCache = state.gitMeta?.files ?? {};
        const branchRef = arg.ref ?? state.config.branch ?? "HEAD";
        const projectId = String(arg.id);
        const cacheBaseKey = `${projectId}/${branchRef}`;
        const pendingUpdates: Record<string, TFileMetaCacheEntry> = {};

        const enrichedFiles: TTree[] = await Promise.all(
          response.map(async (file): Promise<TTree> => {
            if (file.type !== "blob") {
              return convertGitLabTreeToTTree([file])[0];
            }

            const cacheKey = `${cacheBaseKey}/${file.path}`;
            const cachedMeta = metadataCache[cacheKey];

            if (
              cachedMeta &&
              cachedMeta.sha === file.id &&
              cachedMeta.size !== undefined
            ) {
              return {
                ...convertGitLabTreeToTTree([file])[0],
                commitDate: cachedMeta.commitDate,
                createdDate: cachedMeta.createdDate,
                size: cachedMeta.size,
              };
            }

            try {
              const commitsPromise: Promise<any[]> = dispatch(
                gitlabCommitApi.endpoints.getGitLabCommits.initiate({
                  id: arg.id,
                  ref: arg.ref,
                  path: file.path,
                  per_page: 1,
                }),
              ).unwrap();

              let sizePromise: Promise<number | null> | undefined;
              if (!cachedMeta?.size) {
                sizePromise = dispatch(
                  (
                    gitlabContentApi as any
                  ).endpoints.getGitLabFileMetadata.initiate({
                    id: arg.id,
                    ref: arg.ref,
                    file_path: file.path,
                  }),
                ).unwrap();
              }

              const [commits, fetchedSize]: [any[], number | null | undefined] =
                await Promise.all([commitsPromise, sizePromise]);

              const size: number | undefined = fetchedSize ?? cachedMeta?.size;

              const latestCommit: any = commits?.[0];
              if (latestCommit || size !== undefined) {
                pendingUpdates[cacheKey] = {
                  sha: file.id,
                  commitDate:
                    latestCommit?.committed_date ?? cachedMeta?.commitDate,
                  createdDate:
                    latestCommit?.committed_date ?? cachedMeta?.createdDate,
                  size: size ?? cachedMeta?.size,
                };

                return {
                  ...convertGitLabTreeToTTree([file])[0],
                  commitDate:
                    latestCommit?.committed_date ?? cachedMeta?.commitDate,
                  createdDate:
                    latestCommit?.committed_date ?? cachedMeta?.createdDate,
                  size: size,
                };
              }
            } catch (e) {
              // Ignore fetch errors and return file without metadata
            }

            return convertGitLabTreeToTTree([file])[0];
          }),
        );

        if (Object.keys(pendingUpdates).length > 0) {
          store.dispatch(upsertFileMetadata(pendingUpdates));
        }

        return {
          data: {
            trees: pathToDir(enrichedFiles as any, arg.config),
            files: enrichedFiles,
          },
        };
      },
      providesTags: [{ type: "GitLabFiles", id: "LIST" }],
    }),

    /**
     * Get GitLab file content
     */
    getGitLabContent: builder.query<
      Record<string, unknown>,
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
      { download_url: string; size: number; content?: string },
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
        const headers = (meta as any)?.headers as Record<string, string>;
        const sizeHeader = headers?.["x-gitlab-size"];
        if (sizeHeader) {
          return parseInt(sizeHeader, 10);
        }
        return null;
      },
    }),

    /**
     * Get GitLab snippets (from .sitepins/snippets folder)
     */
    getGitLabSnippets: builder.query<
      MdxSnippet[],
      {
        id: string | number;
        ref?: string;
      }
    >({
      query: ({ id, ref }) => ({
        endpoint: `/projects/${encodeProjectPath(String(id))}/repository/tree`,
        params: {
          path: SNIPPET_FOLDER,
          ref,
          per_page: 100,
        },
      }),
      providesTags: (_result, _error, arg) => [
        {
          type: "GitLabContent",
          id: `${arg.id}/${arg.ref}/${SNIPPET_FOLDER}`,
        },
      ],
      async transformResponse(
        response: TGitLabTreeItem[] | { message?: string },
        _meta,
        arg: { id: string | number; ref?: string },
      ): Promise<MdxSnippet[]> {
        // Handle case where snippets folder doesn't exist
        if (!Array.isArray(response)) {
          store.dispatch(updateConfig({ snippets: [] }));
          return [];
        }

        const { config } = store.getState();
        const dispatch = store.dispatch;

        const snippetFiles = response.filter((item) => item.type === "blob");

        const snippetResults = await Promise.all<MdxSnippet | null>(
          snippetFiles.map(async (file) => {
            try {
              const rawUrl = `https://gitlab.com/api/${GITLAB_API_VERSION}/projects/${encodeProjectPath(String(arg.id))}/repository/files/${encodeURIComponent(file.path)}/raw`;
              const fetchUrl = arg.ref
                ? `${rawUrl}?ref=${encodeURIComponent(arg.ref)}`
                : rawUrl;

              const headers: Record<string, string> = {};
              if (config.currentLoginUserToken) {
                headers["PRIVATE-TOKEN"] = config.currentLoginUserToken;
              }

              const fetchResponse = await fetch(fetchUrl, { headers });

              if (!fetchResponse.ok) {
                console.warn(
                  "Failed to fetch snippet",
                  file.path,
                  fetchResponse.status,
                );
                return null;
              }

              const decoded = await fetchResponse.text();
              return parseSnippetFile(decoded, file.path);
            } catch (error) {
              console.warn(
                "Failed to load snippet",
                file.path,
                error instanceof Error ? error.message : error,
              );
              return null;
            }
          }),
        );

        const snippets = snippetResults.filter(
          (snippet): snippet is MdxSnippet => snippet !== null,
        );

        dispatch(updateConfig({ snippets }));

        return snippets;
      },
    }),

    /**
     * Get GitLab site config (from .sitepins/config.json)
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
            const state = getState() as any;
            const framework = arg.framework || state.config.framework;

            const config = data as any;
            const migrated = migrateConfig(config, framework);
            dispatch(updateConfig(migrated));

            // Auto-persist migrated config to GitLab
            dispatch(
              gitlabCommitApi.endpoints.updateGitLabFiles.initiate({
                id: arg.id,
                branch: arg.ref || "main",
                files: [
                  {
                    path: arg.file_path,
                    content: JSON.stringify(migrated, null, 2),
                  },
                  getManifestFile(migrated.public),
                ],
                message: "chore: migrate config to new format",
              }),
            );
          } else if (!Array.isArray(data)) {
            dispatch(updateConfig(data as any));
          }
        } catch (_error) {
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
