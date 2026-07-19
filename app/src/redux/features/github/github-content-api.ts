import { MdxSnippet } from "@/editor/utils/plate-types";
import { GITHUB_API_VERSION, IS_DEMO, SNIPPET_FOLDER } from "@/lib/constant";
import { checkMedia } from "@/lib/utils/check-media-file";
import {
  getManifestFile,
  isOldConfigFormat,
  migrateConfig,
} from "@/lib/utils/config-migration";
import { parseContentJson } from "@/lib/utils/content-serializer";
import { Framework } from "@/lib/utils/framework-detector";
import { fmDetector } from "@/lib/utils/frontmatter-detector";
import { parseSnippetFile } from "@/lib/utils/git-utils";
import { pathToDir } from "@/lib/utils/path-to-dir";
import { store } from "@/redux/store";
import { TConfig, TFiles, TTree } from "@/types";
import path from "path";
import { TFileMetaCacheEntry, upsertFileMetadata } from "../config/meta-slice";
import { updateConfig } from "../config/slice";
import { githubApi } from "./github-api";
import { githubCommitApi } from "./github-commit-api";
import { TGitHubOption, TGitHubPromise } from "./github-type";

export const githubContentApi = githubApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (builder) => ({
    getGitHubInstallations: builder.query<
      TGitHubPromise<"GET /user/installations">,
      TGitHubOption<"GET /user/installations">
    >({
      query: (options) => {
        const { config } = store.getState();
        return {
          endpoint: "GET /user/installations",
          options: {
            token: config.currentLoginUserToken,
            ...options,
          },
        };
      },
      providesTags: ["GitHubInstallations"],
    }),

    getGitHubInstallation: builder.query<
      TGitHubPromise<"GET /app/installations/{installation_id}">,
      TGitHubOption<"GET /app/installations/{installation_id}">
    >({
      query: (options) => ({
        endpoint: "GET /app/installations/{installation_id}",
        options: { ...options },
      }),
      providesTags: ["GitHubInstallations"],
    }),

    getGitHubReposByInstallationId: builder.query<
      TGitHubPromise<"GET /user/installations/{installation_id}/repositories">,
      TGitHubOption<"GET /user/installations/{installation_id}/repositories">
    >({
      query: (options) => ({
        endpoint: "GET /user/installations/{installation_id}/repositories",
        options: { ...options },
      }),
      providesTags: ["GitHubInstallations"],
    }),

    createNewGitHubBranchRef: builder.mutation<
      TGitHubPromise<"POST /repos/{owner}/{repo}/git/refs">,
      TGitHubOption<"POST /repos/{owner}/{repo}/git/refs">
    >({
      query: (options) => ({
        endpoint: "POST /repos/{owner}/{repo}/git/refs",
        options: { ...options },
      }),
      invalidatesTags: ["GitHubBranches"],
    }),

    getGitHubUserName: builder.query<
      TGitHubPromise<"GET /user">,
      TGitHubOption<"GET /user">
    >({
      query: (options) => ({
        endpoint: "GET /user",
        options: { ...options },
      }),
      providesTags: ["GitHubUser"],
    }),

    addGitHubRepo: builder.mutation<
      TGitHubPromise<"POST /user/repos">,
      TGitHubOption<"POST /user/repos">
    >({
      query: (options) => ({
        endpoint: "POST /user/repos",
        options: { ...options },
      }),
    }),

    getGitHubTrees: builder.query<
      {
        trees: TFiles[];
        files: TTree[];
      },
      TGitHubOption<"GET /repos/{owner}/{repo}/git/trees/{tree_sha}"> & {
        raw?: boolean;
        config: TConfig;
      }
    >({
      query: ({ owner, repo, tree_sha, recursive }) => ({
        endpoint: `GET /repos/{owner}/{repo}/git/trees/{tree_sha}?_nocache=${Date.now()}`,
        options: { owner, repo, tree_sha, recursive },
      }),
      providesTags: [{ type: "GitHubFiles", id: "LIST" }],
      // @ts-ignore
      async transformResponse(
        baseQueryReturnValue:
          | TFiles[]
          | TGitHubPromise<"GET /repos/{owner}/{repo}/git/trees/{tree_sha}">,
        _meta,
        arg,
      ) {
        const response =
          baseQueryReturnValue as TGitHubPromise<"GET /repos/{owner}/{repo}/git/trees/{tree_sha}">;

        return {
          trees: pathToDir(response.tree as any, arg.config),
          files: response.tree,
        };
      },
    }),

    getGitHubContent: builder.query<
      Record<string, any>,
      TGitHubOption<"GET /repos/{owner}/{repo}/contents/{path}"> & {
        config?: TConfig;
      }
    >({
      query: ({ owner, repo, path, ref }) => ({
        endpoint: `GET /repos/{owner}/{repo}/contents/{path}?_nocache=${Date.now()}`,
        options: { owner, repo, path, ref },
      }),
      providesTags: (_result, _error, arg) => [
        {
          type: "GitHubContent",
          id: `${arg.owner}/${arg.repo}/${arg.ref}/${arg.path}/${String(arg.parser)}`,
        },
        { type: "GitHubContent" }, // Add general tag for easier invalidation
      ],
      async transformResponse(
        baseQueryReturnValue: Record<string, any>,
        _meta,
        arg: TGitHubOption<"GET /repos/{owner}/{repo}/contents/{path}"> & {
          config: TConfig;
        },
      ) {
        if (Array.isArray(baseQueryReturnValue)) {
          // Increased limit from 200 to 500 to support date sorting for larger media folders
          if (baseQueryReturnValue.length > 500) {
            return baseQueryReturnValue;
          }

          const dispatch = store.dispatch;
          const state = store.getState();
          const metadataCache = state.gitMeta?.files ?? {};
          const branchRef = arg.ref ?? state.config.branch ?? "HEAD";
          const cacheBaseKey = `${arg.owner}/${arg.repo}/${branchRef}`;
          const pendingUpdates: Record<string, TFileMetaCacheEntry> = {};

          const enrichedFiles = await Promise.all(
            baseQueryReturnValue.map(async (file) => {
              if (file.type !== "file") {
                return file;
              }

              const cacheKey = `${cacheBaseKey}/${file.path}`;
              const cachedMeta = metadataCache[cacheKey];

              if (cachedMeta && cachedMeta.sha === file.sha) {
                return {
                  ...file,
                  commitDate: cachedMeta.commitDate,
                  createdDate: cachedMeta.createdDate,
                };
              }

              const commits = await dispatch(
                githubCommitApi.endpoints.getGitHubCommits.initiate({
                  owner: arg.owner,
                  repo: arg.repo,
                  sha: arg.ref,
                  path: file.path,
                }),
              ).unwrap();

              const latestCommitDate = commits?.[0]?.commit.author?.date;
              const oldestCommitDate = Array.isArray(commits)
                ? commits[commits.length - 1]?.commit.author?.date
                : undefined;

              if (latestCommitDate || oldestCommitDate) {
                pendingUpdates[cacheKey] = {
                  sha: file.sha,
                  commitDate: latestCommitDate,
                  createdDate: oldestCommitDate ?? latestCommitDate,
                };
              }

              return {
                ...file,
                commitDate: latestCommitDate,
                createdDate: oldestCommitDate ?? latestCommitDate,
              };
            }),
          );

          if (Object.keys(pendingUpdates).length > 0) {
            store.dispatch(upsertFileMetadata(pendingUpdates));
          }

          return {
            trees: pathToDir(
              enrichedFiles as any,
              arg.config || store.getState().config,
            ),
            files: enrichedFiles,
          };
        } else if (
          typeof baseQueryReturnValue === "object" &&
          baseQueryReturnValue.type === "file" &&
          "content" in baseQueryReturnValue
        ) {
          const { parser } = arg;

          // If this is a media file (image/video/audio) we should not attempt
          // to decode it as UTF-8 or parse frontmatter. Return raw base64 so
          // consumers that expect media can handle it safely.
          const isMedia = checkMedia(arg.path || "");
          if (isMedia) {
            return {
              data: baseQueryReturnValue.content,
              sha: baseQueryReturnValue.sha,
            };
          }

          const decodedContent = Buffer.from(
            //@ts-ignore
            baseQueryReturnValue.content || "",
            "base64",
          ).toString("utf-8");

          if (parser) {
            const fm = fmDetector(decodedContent, path.parse(arg.path).ext);
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
              sha: baseQueryReturnValue.sha,
            };
          }

          return {
            data: decodedContent,
            sha: baseQueryReturnValue.sha,
          };
        } else if (IS_DEMO && baseQueryReturnValue.fmType) {
          return baseQueryReturnValue;
        } else if (
          IS_DEMO &&
          baseQueryReturnValue.type !== "file" &&
          baseQueryReturnValue.content
        ) {
          return {
            data: baseQueryReturnValue.content,
          };
        }

        const decodedContent = Buffer.from(
          baseQueryReturnValue.content,
          "base64",
        ).toString("utf-8");

        return {
          data: decodedContent,
          sha: (baseQueryReturnValue as any)?.sha,
        };
      },
    }),

    getGitHubSnippets: builder.query<
      MdxSnippet[],
      Omit<TGitHubOption<"GET /repos/{owner}/{repo}/contents/{path}">, "path">
    >({
      query: ({ owner, repo, ref, ...rest }) => ({
        endpoint: "GET /repos/{owner}/{repo}/contents/{path}",
        options: { owner, repo, path: SNIPPET_FOLDER, ref, ...rest },
      }),
      providesTags: (_result, _error, arg) => [
        {
          type: "GitHubContent",
          id: `${arg.owner}/${arg.repo}/${arg.ref}/${SNIPPET_FOLDER}`,
        },
        { type: "GitHubContent" }, // Add general tag for easier invalidation
      ],
      async transformResponse(
        baseQueryReturnValue: Record<string, any> | Record<string, any>[],
        _meta,
        arg,
      ): Promise<MdxSnippet[]> {
        if (!Array.isArray(baseQueryReturnValue)) {
          store.dispatch(updateConfig({ snippets: [] }));
          return [];
        }

        const { config } = store.getState();
        const authHeaders: Record<string, string> = {
          accept: "application/vnd.github.raw+json",
          "X-GitHub-Api-Version": GITHUB_API_VERSION,
        };
        if (config.currentLoginUserToken) {
          authHeaders.Authorization = `Bearer ${config.currentLoginUserToken}`;
        }

        const snippetFiles = baseQueryReturnValue.filter(
          (file: Record<string, any>) => file.type === "file",
        ) as Array<Record<string, any>>;

        const snippetResults = await Promise.all<MdxSnippet | null>(
          snippetFiles.map(async (file: Record<string, any>) => {
            try {
              const hasToken = Boolean(config.currentLoginUserToken);
              const baseUrl = hasToken ? file.url : file.download_url;

              if (!baseUrl) {
                return null;
              }

              let requestUrl = baseUrl;

              if (hasToken) {
                try {
                  const url = new URL(baseUrl);
                  const refValue = arg.ref ?? config.branch;
                  if (refValue && !url.searchParams.has("ref")) {
                    url.searchParams.set("ref", refValue);
                  }
                  requestUrl = url.toString();
                } catch (_err) {
                  const refValue = arg.ref ?? config.branch;
                  if (refValue) {
                    const separator = baseUrl.includes("?") ? "&" : "?";
                    requestUrl = `${baseUrl}${separator}ref=${encodeURIComponent(refValue)}`;
                  }
                }
              }

              const response = await fetch(requestUrl, {
                headers: hasToken
                  ? authHeaders
                  : { accept: authHeaders.accept },
              });

              if (!response.ok) {
                console.warn(
                  "Failed to fetch snippet",
                  file.path,
                  response.status,
                );
                return null;
              }

              const decoded = await response.text();

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

        store.dispatch(updateConfig({ snippets }));

        return snippets;
      },
    }),

    getGitHubSiteConfig: builder.query<
      TGitHubPromise<"GET /repos/{owner}/{repo}/contents/{path}">,
      TGitHubOption<"GET /repos/{owner}/{repo}/contents/{path}"> & {
        framework?: Framework;
      }
    >({
      query: ({ owner, repo, path, ref }) => ({
        endpoint: "GET /repos/{owner}/{repo}/contents/{path}",
        options: { owner, repo, path, ref },
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

            // Auto-persist migrated config to Git
            dispatch(
              githubCommitApi.endpoints.updateGitHubFiles.initiate({
                owner: arg.owner,
                repo: arg.repo,
                tree: arg.ref || "main",
                files: [
                  {
                    path: arg.path,
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
        } catch (error) {
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

      transformResponse(
        baseQueryReturnValue: Record<string, any>,
        _meta,
        _arg: TGitHubOption<"GET /repos/{owner}/{repo}/contents/{path}">,
      ) {
        if (Array.isArray(baseQueryReturnValue)) {
          return baseQueryReturnValue;
        }
        const decodedContent = Buffer.from(
          //@ts-ignore
          baseQueryReturnValue.content,
          "base64",
        ).toString("utf-8");
        return JSON.parse(decodedContent);
      },
    }),

    getGitHubImage: builder.query<
      { download_url: string; size: number; content?: string; sha?: string },
      TGitHubOption<"GET /repos/{owner}/{repo}/contents/{path}">
    >({
      query: (arg) => {
        return {
          endpoint: `GET /repos/{owner}/{repo}/contents/{path}?_nocache=${Date.now()}`,
          options: arg,
        };
      },
      providesTags: (_result, _error, arg) => [
        {
          type: "GitHubContent",
          id: `IMAGE/${arg.owner}/${arg.repo}/${arg.ref}/${arg.path}`,
        },
      ],
    }),

    getGitHubDeployStatusByDepId: builder.query<
      TGitHubPromise<"GET /repos/{owner}/{repo}/deployments/{deployment_id}/statuses">,
      TGitHubOption<"GET /repos/{owner}/{repo}/deployments/{deployment_id}/statuses">
    >({
      query: (arg) => ({
        endpoint:
          "GET /repos/{owner}/{repo}/deployments/{deployment_id}/statuses",
        options: arg,
      }),
    }),
  }),
});

export const {
  useGetGitHubInstallationsQuery,
  useGetGitHubInstallationQuery,
  useLazyGetGitHubReposByInstallationIdQuery,
  useGetGitHubReposByInstallationIdQuery,
  useAddGitHubRepoMutation,
  useGetGitHubUserNameQuery,
  useGetGitHubTreesQuery,
  useGetGitHubSiteConfigQuery,
  useGetGitHubContentQuery,
  useLazyGetGitHubContentQuery,
  useGetGitHubSnippetsQuery,
  useGetGitHubImageQuery,
  useCreateNewGitHubBranchRefMutation,
} = githubContentApi;
