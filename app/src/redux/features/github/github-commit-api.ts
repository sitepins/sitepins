import { authClient } from "@/lib/auth/auth-client";
import { GITHUB_APP_NAME, IS_DEMO, SCHEMA_FOLDER } from "@/lib/constant";
import { logger } from "@/lib/logger";
import { checkMedia } from "@/lib/utils/check-media-file";
import { parseContentJson } from "@/lib/utils/content-serializer";
import { fmDetector } from "@/lib/utils/frontmatter-detector";
import {
  createGitCommitMessage,
  delay,
  getGitAuthDetails,
  isTransientNetworkError,
  runWithConcurrency,
  toBase64,
} from "@/lib/utils/git-utils";
import { pathToDir } from "@/lib/utils/path-to-dir";
import { TreeCache } from "@/redux/features/git/provider-args";
import { RootState } from "@/redux/store";
import { TTree } from "@/types";
import path from "path";
import { toast } from "sonner";
import { updateConfig } from "../config/slice";
import {
  coAuthorOf,
  CommitAuthor,
  createCommitTokenSession,
  prepareCommit,
  resolveCommitAuthor,
  resolveImpersonatePreference,
} from "../git/commit-session";
import { githubApi } from "./github-api";
import { githubContentApi } from "./github-content-api";
import { TGitHubOption, TGitHubPromise } from "./github-type";

// ============================================================================
// RESPONSE SHAPES
// ============================================================================

// `fetchWithBQ` hands back `unknown`, so these describe only the fields this
// module reads off each GitHub REST response.

type GhCommitRef = {
  sha?: string;
  commit?: { message?: string; tree?: { sha?: string } };
  parents?: { sha?: string }[];
};

type GhGitRef = { object?: { sha?: string } };

type GhBranch = {
  commit?: { sha?: string; commit?: { tree?: { sha?: string } } };
};

type GhGitCommit = { sha?: string; tree?: { sha?: string } };

type GhContentsFile = { sha?: string };

type GhContentsWrite = { commit?: { sha?: string } };

type GhContentDirectory = { path?: string }[];

// Thrown values arrive as `unknown`; these read the two fields the error
// paths below care about without widening the catch back to `any`.
const errStatus = (error: unknown): number | undefined => {
  const status = (error as { status?: unknown } | undefined)?.status;
  return typeof status === "number" ? status : undefined;
};

const errMessage = (error: unknown): string | undefined => {
  const message = (error as { message?: unknown } | undefined)?.message;
  return typeof message === "string" ? message : undefined;
};

type GhCommitStatus = {
  state?: string;
  total_count?: number;
  statuses?: unknown[];
};

// ============================================================================
// API ENDPOINTS
// ============================================================================

export const githubCommitApi = githubApi.injectEndpoints({
  overrideExisting: true,
  endpoints: (build) => ({
    /**
     * Get commit history for a repository
     */
    getGitHubCommits: build.query<
      TGitHubPromise<"GET /repos/{owner}/{repo}/commits">,
      TGitHubOption<"GET /repos/{owner}/{repo}/commits">
    >({
      query: (arg) => ({
        endpoint: "GET /repos/{owner}/{repo}/commits",
        options: arg,
      }),
      providesTags(_result, _error, _arg, _meta) {
        return [{ type: "GitHubCommit", id: "LIST" }];
      },
      serializeQueryArgs: ({
        queryArgs,
      }: {
        queryArgs: TGitHubOption<"GET /repos/{owner}/{repo}/commits">;
      }) => {
        const { owner, repo, sha, path } = queryArgs;
        return { owner, repo, sha, path };
      },
      merge(currentCache, newItems, { arg }) {
        if (!newItems || !Array.isArray(newItems)) return currentCache;
        if (!currentCache || !Array.isArray(currentCache) || arg?.page === 1) {
          return newItems;
        }

        const existingShas = new Set(
          currentCache.map((c: { sha?: string }) => c.sha),
        );
        const filteredNewItems = newItems.filter(
          (item: { sha?: string }) => !existingShas.has(item.sha),
        );
        return [...currentCache, ...filteredNewItems];
      },
      forceRefetch({ currentArg, previousArg }) {
        return (
          currentArg?.path !== previousArg?.path ||
          currentArg?.sha !== previousArg?.sha ||
          currentArg?.page !== previousArg?.page
        );
      },
    }),

    /**
     * Get commit status for a repository reference (SHA, branch, etc.)
     */
    getGitHubCommitStatus: build.query<
      GhCommitStatus,
      TGitHubOption<"GET /repos/{owner}/{repo}/commits/{ref}/status">
    >({
      query: (arg) => ({
        endpoint: "GET /repos/{owner}/{repo}/commits/{ref}/status",
        options: arg,
      }),
      transformResponse: (response: GhCommitStatus) => {
        // If total_count is 0, it means no statuses/checks are configured on this repo.
        // Return a sentinel so we stop polling and do not show a pending badge.
        if (response && response.total_count === 0) {
          return { state: "no_status", statuses: [] };
        }
        return response;
      },
      providesTags: ["GitHubCommitStatus"],
    }),

    /**
     * Upload multiple files to a GitHub repository
     *
     * Uses low-level Git API (blobs, trees, commits) for efficient batch uploads.
     * Automatically falls back to Contents API if Git API fails.
     *
     * Features:
     * - Automatic filtering of system files (.DS_Store, etc.)
     * - Batched uploads to avoid API limits
     * - Rate limiting between batches
     * - Automatic fallback to Contents API
     * - Proper tree SHA handling for subsequent commits
     */
    updateGitHubFiles: build.mutation<
      TGitHubPromise<"POST /repos/{owner}/{repo}/git/commits">,
      TGitHubOption<"POST /repos/{owner}/{repo}/git/commits"> & {
        // content is optional when deleting a file. Use `delete: true` to remove a file.
        files: Array<{ path: string; content?: string; delete?: boolean }>;
        message: string;
        description?: string;
        createFolder?: boolean;
        createNewBranch?: boolean;
      }
    >({
      // @ts-ignore
      async queryFn(
        {
          owner,
          repo,
          tree: branch,
          files,
          message,
          description,
          createNewBranch: _createNewBranch,
        },
        { getState, dispatch },
        _extraOptions,
        fetchWithBQ,
      ) {
        // ============================================================================
        // STEP 1: Filter files (applies to both Git API and fallback Contents API)
        // ============================================================================
        const prepared = prepareCommit(files, message);
        if (!prepared) {
          return { data: null };
        }
        const { files: filteredFiles, message: effectiveMessage } = prepared;

        const { config: storeConfig } = getState() as RootState;

        const session = createCommitTokenSession(
          storeConfig.currentLoginUserToken,
          storeConfig.token,
        );

        const impersonate = await resolveImpersonatePreference(dispatch);

        // Declared out here so the Contents API fallback in `catch` can reuse
        // it; an empty author simply means no co-author trailer.
        let author: CommitAuthor = {};

        try {
          if (IS_DEMO) {
            return { data: null };
          }

          // ============================================================================
          // STEP 2: Get user details and prepare auth info
          // ============================================================================

          author = await resolveCommitAuthor({
            session,
            fetchUser: (token) =>
              fetchWithBQ({ endpoint: "GET /user", options: { token } }),
            mapUser: (data) => {
              const user = data as { login?: string; email?: string | null };
              return {
                name: user.login,
                // GitHub returns null for users with a private email.
                email:
                  user.email ||
                  (user.login
                    ? `${user.login}@users.noreply.github.com`
                    : undefined),
              };
            },
          });

          const auth_details = getGitAuthDetails("Github");

          // Get branch reference and tree SHA
          let baseCommitSha: string | null = null;
          let baseTreeSha: string | null = null;

          try {
            const branchResult = await session.run((token) =>
              fetchWithBQ({
                endpoint: `GET /repos/{owner}/{repo}/branches/{branch}?_nocache=${Date.now()}`,
                options: {
                  owner,
                  repo,
                  branch,
                  ...(token && { token }),
                },
              }),
            );

            if (branchResult.data) {
              const branchData = branchResult.data as {
                commit: {
                  sha: string;
                  commit?: { tree?: { sha?: string } };
                  tree?: { sha?: string };
                };
              };
              baseCommitSha = branchData.commit.sha;
              baseTreeSha =
                branchData.commit.commit?.tree?.sha ||
                branchData.commit.tree?.sha ||
                null;
            } else if (branchResult.error) {
              const err = branchResult.error;
              if (err.status !== 404) {
                throw new Error(
                  `Failed to fetch branch info: ${err.message || err.status}`,
                );
              }
            }
          } catch (e) {
            if ((e as { status?: number })?.status !== 404) throw e;
          }

          // Fallback: fetch tree SHA from commit if missing
          if (baseCommitSha && !baseTreeSha) {
            try {
              const commitResult = await session.run((token) =>
                fetchWithBQ({
                  endpoint: `GET /repos/{owner}/{repo}/git/commits/{commit_sha}?_nocache=${Date.now()}`,
                  options: {
                    owner,
                    repo,
                    commit_sha: baseCommitSha,
                    ...(token && { token }),
                  },
                }),
              );

              if (commitResult.data) {
                baseTreeSha =
                  (commitResult.data as { tree?: { sha?: string } }).tree
                    ?.sha || null;
              }
            } catch {
              // Ignore fallback errors
            }

            if (!baseTreeSha) {
              throw new Error(
                "Failed to retrieve repository tree. Please try again.",
              );
            }
          }

          // Split files into batches
          const BATCH_SIZE = baseCommitSha ? 100 : 50;
          const batches: Array<
            { path: string; content?: string; delete?: boolean }[]
          > = [];
          for (let i = 0; i < filteredFiles.length; i += BATCH_SIZE) {
            batches.push(filteredFiles.slice(i, i + BATCH_SIZE));
          }

          // Process each batch sequentially
          let lastCommitSha = baseCommitSha;
          let lastTreeSha = baseTreeSha;

          for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
            const batch = batches[batchIndex];

            // Adaptive concurrency: large uploads often fail in-browser when too many
            // concurrent requests are in-flight.
            const initialBlobConcurrency = batch.length > 25 ? 3 : 6;
            let blobConcurrency = initialBlobConcurrency;
            let batchAttempt = 0;

            // Retry the whole batch once with lower concurrency on transient failures.
            while (true) {
              // Add delay between batches to avoid rate limiting
              if (batchIndex > 0) {
                await delay(200);
              }

              // ---------------------------------------------------
              // 5.1. Create blobs for files in this batch (skip deletes)
              // Use limited concurrency with light retry to reduce 500s when uploading many files.
              // ---------------------------------------------------
              try {
                const blobs = await runWithConcurrency(
                  batch,
                  blobConcurrency,
                  async (file, fileIdx) => {
                    if (file.delete) return null;

                    const attempt = async (
                      tryIndex: number,
                    ): Promise<{ sha: string }> => {
                      try {
                        const blobResult = await session.run((token) =>
                          fetchWithBQ({
                            endpoint: "POST /repos/{owner}/{repo}/git/blobs",
                            options: {
                              owner,
                              repo,
                              content: file.content,
                              ...(checkMedia(file.path) &&
                                file.content && { encoding: "base64" }),
                              ...(token && { token }),
                            },
                          }),
                        );

                        if (!blobResult.data) {
                          const error = blobResult?.error;

                          // Check if it's a file size error
                          if (error?.status === 422) {
                            throw new Error(
                              `File "${file.path}" is too large for GitHub's blob API (limit: ~25MB). Please reduce the file size or use Git LFS for large files.`,
                            );
                          }

                          throw new Error(
                            `Failed to create blob for file ${fileIdx + 1}/${batch.length}: ${file.path} (${error?.status ?? ""} ${error?.message ?? ""})`,
                          );
                        }

                        return blobResult.data as { sha: string };
                      } catch (error) {
                        if (tryIndex < 3 && isTransientNetworkError(error)) {
                          await delay(200 * (tryIndex + 1));
                          return attempt(tryIndex + 1);
                        }

                        logger.error(
                          `Error creating blob for ${file.path} (attempt ${tryIndex + 1})`,
                          error,
                        );
                        throw error;
                      }
                    };

                    return attempt(0);
                  },
                );

                // ---------------------------------------------------
                // 5.2. Create tree for this batch (use sha: null to delete files)
                // ---------------------------------------------------
                const treeData = batch.map((file, index) => {
                  if (file.delete) {
                    return {
                      path: file.path,
                      mode: "100644",
                      sha: null,
                    };
                  }

                  const blob = blobs[index];
                  return {
                    path: file.path,
                    type: "blob",
                    mode: "100644",
                    sha: blob?.sha,
                  };
                });

                const treeResult = await session.run((token) =>
                  fetchWithBQ({
                    endpoint: "POST /repos/{owner}/{repo}/git/trees",
                    options: {
                      tree: treeData,
                      owner,
                      repo,
                      ...(lastTreeSha && { base_tree: lastTreeSha }),
                      ...(token && { token }),
                    },
                  }),
                );

                if (!treeResult.data) {
                  const error = treeResult?.error;
                  logger.error(
                    `Failed to create tree for batch ${batchIndex + 1}:`,
                    {
                      status: error?.status,
                      message: error?.message,
                      treeSize: treeData.length,
                      baseTreeSha: lastTreeSha,
                      batchFiles: batch.map((f) => f.path),
                    },
                  );
                  throw new Error(
                    `Failed to create tree for batch ${batchIndex + 1}. ${error?.message ?? ""}`,
                  );
                }
                const tree = treeResult.data as { sha: string };

                // ---------------------------------------------------
                // 5.3. Create commit for this batch
                // ---------------------------------------------------
                const batchMessage =
                  batches.length > 1
                    ? `${effectiveMessage} (batch ${batchIndex + 1}/${batches.length}) by Sitepins`
                    : `${effectiveMessage} by Sitepins`;

                const commitMessage = createGitCommitMessage(
                  batchMessage,
                  description,
                  coAuthorOf(author, { impersonate, session }).name,
                  coAuthorOf(author, { impersonate, session }).email,
                  "Github",
                );

                const commitResult = await session.run((token) =>
                  fetchWithBQ({
                    endpoint: "POST /repos/{owner}/{repo}/git/commits",
                    options: {
                      owner,
                      repo,
                      message: commitMessage,
                      author: auth_details,
                      committer: auth_details,
                      tree: tree.sha,
                      ...(lastCommitSha ? { parents: [lastCommitSha] } : {}),
                      ...(token && { token }),
                    },
                  }),
                );

                if (!commitResult.data) {
                  throw new Error(
                    `Failed to create commit for batch ${batchIndex + 1}.`,
                  );
                }
                const commit = commitResult.data as {
                  sha: string;
                  tree: { sha: string };
                };

                // ---------------------------------------------------
                // 5.4. Update or create branch reference
                // ---------------------------------------------------
                if (!lastCommitSha && batchIndex === 0) {
                  // First batch and new repo → create ref
                  await session.run((token) =>
                    fetchWithBQ({
                      endpoint: "POST /repos/{owner}/{repo}/git/refs",
                      options: {
                        owner,
                        repo,
                        ref: "refs/heads/" + branch,
                        sha: commit.sha,
                        ...(token && { token }),
                      },
                    }),
                  );
                } else {
                  // Update ref
                  await session.run((token) =>
                    fetchWithBQ({
                      endpoint: "PATCH /repos/{owner}/{repo}/git/refs/{ref}",
                      options: {
                        sha: commit.sha,
                        force: true,
                        ref: "heads/" + branch,
                        owner,
                        repo,
                        ...(token && { token }),
                      },
                    }),
                  );
                }

                // Update the base SHA and tree SHA for the next batch
                lastCommitSha = commit.sha;
                lastTreeSha = commit.tree.sha;

                break;
              } catch (err) {
                if (batchAttempt < 1 && isTransientNetworkError(err)) {
                  batchAttempt++;
                  blobConcurrency = Math.max(
                    2,
                    Math.floor(blobConcurrency / 2),
                  );
                  await delay(500);
                  continue;
                }
                throw err;
              }
            }
          }

          return { data: { sha: lastCommitSha } };
        } catch (error) {
          // ============================================================================
          // FALLBACK: Use Contents API (slower but more reliable for problematic repos)
          // ============================================================================
          logger.warn(
            "Low-level Git API failed; falling back to Contents API.",
            error,
          );

          // Author and token identity carry over from the Git API attempt.
          const auth_details = getGitAuthDetails("Github");

          // Split into smaller batches - Contents API has stricter limits
          const BATCH_SIZE = 10;
          const batches: Array<
            { path: string; content?: string; delete?: boolean }[]
          > = [];
          for (let i = 0; i < filteredFiles.length; i += BATCH_SIZE) {
            batches.push(filteredFiles.slice(i, i + BATCH_SIZE));
          }

          let lastCommitSha: string | null = null;

          // Process each batch sequentially
          for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
            const batch = batches[batchIndex];

            // Add delay between batches to avoid rate limiting
            if (batchIndex > 0) {
              await delay(1000);
            }

            // Process each file in the batch
            for (let fileIndex = 0; fileIndex < batch.length; fileIndex++) {
              const file = batch[fileIndex];

              // Small delay between files
              if (fileIndex > 0) {
                await delay(100);
              }

              const isMedia = checkMedia(file.path);
              const contentBase64 = isMedia
                ? file.content
                : toBase64(file.content || "");

              const batchMessage =
                batches.length > 1
                  ? `${effectiveMessage} (batch ${batchIndex + 1}/${batches.length}) by Sitepins`
                  : `${effectiveMessage} by Sitepins`;

              const commitMessage = createGitCommitMessage(
                batchMessage,
                description,
                coAuthorOf(author, { impersonate, session }).name,
                coAuthorOf(author, { impersonate, session }).email,
                "Github",
              );

              try {
                // Check if file already exists to get its SHA
                let existingSha: string | undefined;
                try {
                  const headRes = await session.run((token) =>
                    fetchWithBQ({
                      endpoint: `GET /repos/{owner}/{repo}/contents/{path}?_nocache=${Date.now()}`,
                      options: {
                        owner,
                        repo,
                        path: file.path,
                        ref: branch,
                        ...(token && { token }),
                      },
                    }),
                  );
                  existingSha = (headRes?.data as GhContentsFile | undefined)
                    ?.sha;
                } catch {
                  // File doesn't exist yet, that's okay
                  existingSha = undefined;
                }

                if (file.delete) {
                  // Delete the file using Contents API (requires sha)
                  if (!existingSha) {
                    continue;
                  }

                  const deleteRes = await session.run((token) =>
                    fetchWithBQ({
                      endpoint: "DELETE /repos/{owner}/{repo}/contents/{path}",
                      options: {
                        owner,
                        repo,
                        path: file.path,
                        message: commitMessage,
                        branch,
                        sha: existingSha,
                        author: auth_details,
                        committer: auth_details,
                        ...(token && { token }),
                      },
                    }),
                  );

                  if (!deleteRes.data) {
                    logger.error(
                      "Contents API delete failed for",
                      file.path,
                      deleteRes?.error ?? {},
                    );
                    throw new Error(`Failed to delete ${file.path}`);
                  }

                  const commitInfo = (deleteRes.data as GhContentsWrite)
                    ?.commit;
                  if (commitInfo?.sha) {
                    lastCommitSha = commitInfo.sha;
                  }
                  continue;
                }

                // Now create or update the file
                const putRes = await session.run((token) =>
                  fetchWithBQ({
                    endpoint: "PUT /repos/{owner}/{repo}/contents/{path}",
                    options: {
                      owner,
                      repo,
                      path: file.path,
                      message: commitMessage,
                      branch,
                      author: auth_details,
                      committer: auth_details,
                      content: contentBase64,
                      ...(existingSha && { sha: existingSha }),
                      ...(token && { token }),
                    },
                  }),
                );

                if (!putRes.data) {
                  const err = putRes?.error;
                  logger.error(
                    "Contents API upload failed for",
                    file.path,
                    err ?? {},
                  );
                  throw new Error(
                    err?.message || `Failed to upload ${file.path}`,
                  );
                }

                const commitInfo = (putRes.data as GhContentsWrite)?.commit;
                if (commitInfo?.sha) {
                  lastCommitSha = commitInfo.sha;
                }
              } catch (fileError) {
                logger.error(`✗ Failed to process ${file.path}`, fileError);
                // Continue with next file instead of stopping the entire upload
              }
            }
          }

          if (!lastCommitSha) {
            throw new Error(
              "Upload failed. Please check if you have permission to commit to this repository.",
            );
          }

          return {
            data: {
              sha: lastCommitSha,
            } as TGitHubPromise<"POST /repos/{owner}/{repo}/git/commits">,
          };
        }
      },

      // invalidatesTags: (_result, _error, _arg) => [
      //   { type: "GitHubFiles", id: "LIST" },
      // ],

      async onQueryStarted(arg, { queryFulfilled, dispatch, getState }) {
        const { config: storeConfig } = getState() as RootState;

        try {
          await queryFulfilled;
          // Invalidate all related tags
          dispatch(
            githubApi.util.invalidateTags([
              { type: "GitHubCommit", id: "LIST" },
              "GitHubComparison",
              "GitHubBranches",
              { type: "GitHubFiles", id: "LIST" },
              "GitHubCommitStatus",
            ]),
          );

          arg.files.map((file) => {
            // If this file was deleted, remove its cached content and tree entry
            if (file.delete) {
              try {
                // Remove getContent cache for this path (parser true)
                dispatch(
                  githubContentApi.util.updateQueryData(
                    "getGitHubContent",
                    {
                      owner: arg.owner,
                      repo: arg.repo,
                      ref: arg.tree,
                      path: file.path,
                      parser: true,
                    },
                    () => undefined as unknown as GhContentDirectory,
                  ),
                );
              } catch {}

              try {
                // Update getTrees cache to remove this file entry
                dispatch(
                  githubContentApi.util.updateQueryData(
                    "getGitHubTrees",
                    {
                      owner: (getState() as RootState).config.owner,
                      repo: (getState() as RootState).config.repoName,
                      tree_sha: (getState() as RootState).config.branch,
                      recursive: "1",
                      config: (getState() as RootState).config,
                    },
                    (draft: TreeCache) => {
                      if (!draft || !draft.files) return draft;
                      const newFiles = (draft.files || []).filter(
                        (t) => t.path !== file.path,
                      );
                      draft.files = newFiles;
                      draft.trees = pathToDir(
                        newFiles,
                        (getState() as RootState).config,
                      );
                      return draft;
                    },
                  ),
                );
              } catch {}

              try {
                // Also remove the file from its parent folder listing (getContent for folder)
                const parent = path.posix.dirname(file.path || "");
                if (parent) {
                  dispatch(
                    githubContentApi.util.updateQueryData(
                      "getGitHubContent",
                      {
                        owner: arg.owner,
                        repo: arg.repo,
                        ref: arg.tree,
                        path: parent,
                      },
                      ((draft: GhContentDirectory) => {
                        if (!Array.isArray(draft)) return draft;
                        return draft.filter((f) => f.path !== file.path);
                      }) as never,
                    ),
                  );
                }
              } catch {}

              try {
                // Force refetch the parent folder and the file itself to ensure cache is cleared
                // @ts-ignore
                dispatch(
                  githubContentApi.endpoints.getGitHubContent.initiate(
                    {
                      owner: arg.owner,
                      repo: arg.repo,
                      ref: arg.tree,
                      path: file.path,
                      parser: true,
                    },
                    { forceRefetch: true },
                  ),
                );

                // @ts-ignore
                dispatch(
                  githubContentApi.endpoints.getGitHubContent.initiate(
                    {
                      owner: arg.owner,
                      repo: arg.repo,
                      ref: arg.tree,
                      path: file.path,
                      parser: false,
                    },
                    { forceRefetch: true },
                  ),
                );

                // Force refetch parent folder listing as well
                const parent = path.posix.dirname(file.path || "");
                if (parent) {
                  // @ts-ignore
                  dispatch(
                    githubContentApi.endpoints.getGitHubContent.initiate(
                      {
                        owner: arg.owner,
                        repo: arg.repo,
                        ref: arg.tree,
                        path: parent,
                      },
                      { forceRefetch: true },
                    ),
                  );
                }

                // Also force refetch getTrees to ensure tree listings are up-to-date
                // @ts-ignore
                dispatch(
                  githubContentApi.endpoints.getGitHubTrees.initiate(
                    {
                      owner: (getState() as RootState).config.owner,
                      repo: (getState() as RootState).config.repoName,
                      tree_sha: (getState() as RootState).config.branch,
                      recursive: "1",
                      config: (getState() as RootState).config,
                    },
                    { forceRefetch: true },
                  ),
                );
              } catch {
                // ignore
              }

              // continue to next file processing
              return;
            }
            // Handle config file only when content is provided
            if (file.path === ".sitepins/config.json") {
              if (file.content) {
                const config = JSON.parse(file.content);
                dispatch(updateConfig(config));
                dispatch(
                  githubContentApi.util.updateQueryData(
                    "getGitHubTrees",
                    {
                      owner: storeConfig.owner,
                      repo: storeConfig.repoName,
                      tree_sha: storeConfig.branch,
                      recursive: "1",
                      config: storeConfig,
                    },
                    (draft: TreeCache) => {
                      draft.trees = pathToDir(draft.files, {
                        ...storeConfig,
                        ...config,
                      });
                      return draft;
                    },
                  ),
                );
              }
            } else if (file.path.startsWith(storeConfig.content) && IS_DEMO) {
              const fm = file.content
                ? fmDetector(file.content, path.parse(file.path).ext)
                : undefined;
              const parsedContent =
                file.content && fm
                  ? parseContentJson(file.content, fm)
                  : undefined;

              // update tree
              dispatch(
                githubContentApi.util.updateQueryData(
                  "getGitHubTrees",
                  {
                    owner: storeConfig.owner,
                    repo: storeConfig.repoName,
                    tree_sha: storeConfig.branch,
                    recursive: "1",
                    config: storeConfig,
                  },
                  (draft: TreeCache) => {
                    const pathTrees = draft.files.filter(
                      (tree) => tree.path !== file.path,
                    );

                    if (file.content) {
                      const extension = path.extname(file.path);
                      pathTrees.push({
                        path: file.path,
                        type: extension ? "tree" : "blob",
                        sha: null,
                        mode: "100644",
                      });
                    }

                    return {
                      files: pathTrees,
                      trees: pathToDir(pathTrees, storeConfig),
                    };
                  },
                ),
              );

              // update as raw content only when provided
              if (file.content !== undefined) {
                dispatch(
                  githubContentApi.util.upsertQueryData(
                    "getGitHubContent",
                    {
                      owner: arg.owner,
                      repo: arg.repo,
                      ref: arg.tree,
                      path: file.path,
                      parser: false,
                    },
                    {
                      data: file.content,
                      content: file.content,
                    },
                  ),
                );
              }

              // Only parse content for content files, not code files
              if (
                file.content &&
                file.path.startsWith(storeConfig.content) &&
                parsedContent
              ) {
                dispatch(
                  githubContentApi.util.upsertQueryData(
                    "getGitHubContent",
                    {
                      owner: arg.owner,
                      repo: arg.repo,
                      ref: arg.tree,
                      path: file.path,
                      parser: true,
                    },
                    {
                      data: {
                        ...parsedContent.data,
                      },
                      content: parsedContent.content,
                      fmType: fm,
                    },
                  ),
                );
              }
            } else if (file.path.startsWith(storeConfig.content)) {
              const fm = file.content
                ? fmDetector(file.content, path.parse(file.path).ext)
                : undefined;
              const parsedContent =
                file.content && fm
                  ? parseContentJson(file.content, fm)
                  : undefined;

              let startWith = "---";
              if (file.content?.startsWith("+++")) {
                startWith = "+++";
              } else if (file.content?.startsWith("---toml")) {
                startWith = "---toml";
              }

              if (file.content !== undefined) {
                dispatch(
                  githubContentApi.util.upsertQueryData(
                    "getGitHubContent",
                    {
                      owner: arg.owner,
                      repo: arg.repo,
                      ref: arg.tree,
                      path: file.path,
                      parser: false,
                    },
                    {
                      data: file.content,
                      content: file.content,
                    },
                  ),
                );
              }

              if (file.content && parsedContent) {
                dispatch(
                  githubContentApi.util.upsertQueryData(
                    "getGitHubContent",
                    {
                      owner: arg.owner,
                      repo: arg.repo,
                      ref: arg.tree,
                      path: file.path,
                      parser: true,
                    },
                    {
                      data: {
                        ...parsedContent.data,
                      },
                      content: parsedContent.content,
                      fmType: fm,
                      startWith,
                    },
                  ),
                );
              }
            } else if (file.path.startsWith(storeConfig.public)) {
              // upload local image if is in demo mode
              if (IS_DEMO) {
                dispatch(
                  githubContentApi.util.upsertQueryData(
                    "getGitHubImage",
                    {
                      owner: arg.owner,
                      repo: arg.repo,
                      ref: arg.tree,
                      path: file.path,
                    },
                    {
                      size: 0,
                      download_url: "",
                      // @ts-ignore
                      content: file.content,
                    },
                  ),
                );
              }

              dispatch(
                githubContentApi.util.updateQueryData(
                  "getGitHubTrees",
                  {
                    owner: storeConfig.owner,
                    repo: storeConfig.repoName,
                    tree_sha: storeConfig.branch,
                    recursive: "1",
                    config: storeConfig,
                  },
                  (draft: TreeCache) => {
                    const pathTrees = draft.files.filter(
                      (tree) => tree.path !== file.path,
                    );

                    if (file.content) {
                      const extension = path.extname(file.path);

                      pathTrees.push({
                        path: file.path,
                        type: !extension ? "tree" : "blob",
                        sha: null,
                        mode: "100644",
                      });
                    }

                    return {
                      files: pathTrees,
                      trees: pathToDir(pathTrees, storeConfig),
                    };
                  },
                ),
              );
            } else if (file.path.startsWith(SCHEMA_FOLDER) && IS_DEMO) {
              if (file.content) {
                const fm = fmDetector(file.content, path.parse(file.path).ext);
                const parsedContent = parseContentJson(file.content, fm);
                dispatch(
                  githubContentApi.util.upsertQueryData(
                    "getGitHubContent",
                    {
                      owner: arg.owner,
                      repo: arg.repo,
                      ref: arg.tree,
                      path: file.path,
                      parser: true,
                    },
                    {
                      data: {
                        ...parsedContent.data,
                      },
                      content: null,
                      fmType: "json",
                      startWith: "---",
                    },
                  ),
                );
              }
            }
          });
        } catch (thrown) {
          const { error } = (thrown ?? {}) as { error?: { message?: string } };
          toast.error(error?.message);
        }
      },
    }),

    /**
     * Rename a folder in a GitHub repository
     *
     * Creates a new commit that renames all files in a folder by:
     * 1. Fetching the current tree
     * 2. Creating entries for renamed files
     * 3. Deleting old file entries
     * 4. Creating a new commit with the changes
     */
    renameGitHubFolder: build.mutation<
      TGitHubPromise<"PATCH /repos/{owner}/{repo}/git/refs/{ref}">,
      Omit<TGitHubOption<"POST /repos/{owner}/{repo}/git/commits">, "files"> & {
        message: string;
        oldFolder: string;
        newFolder: string;
        description?: string;
      }
    >({
      // @ts-ignore
      async queryFn(
        {
          owner,
          repo,
          tree: branch,
          message,
          newFolder,
          oldFolder,
          description,
        },
        api,
        extraOptions,
        fetchWithBQ,
      ) {
        if (IS_DEMO) {
          return { data: null };
        }
        try {
          const { dispatch, getState } = api;
          const { config: storeConfig } = getState() as RootState;

          const { config } = getState() as RootState;
          // const token = await getSession();
          const { data: auth } = await authClient.getSession();
          const user = auth?.user;
          const loginUserEmail = user?.email;

          const userResult = storeConfig.currentLoginUserToken
            ? await fetchWithBQ({
                endpoint: "GET /user",
                options: {
                  token: storeConfig.currentLoginUserToken,
                },
              })
            : {
                data: {
                  login: user?.full_name.replaceAll(" ", "").toLowerCase(),
                  email: user?.email,
                },
              };

          if (!userResult.data) {
            throw new Error("Failed to fetch user details.");
          }

          const { login, email } = userResult.data as {
            login: string;
            email: string;
          };

          const auth_details = {
            email: `${GITHUB_APP_NAME}[bot]@users.noreply.github.com`,
            name: `${GITHUB_APP_NAME}[bot]`,
          };

          const userEmail =
            email || loginUserEmail || `${login}@users.noreply.github.com`;
          const coAuthor = `Co-authored-by: ${login} <${userEmail}>`;
          const commitMessage = `${message} by Sitepins${description ? `\n\n${description}` : ""}\n\n${coAuthor} `;

          // Step 1: Get the current branch details
          const branchResponse = await fetchWithBQ({
            endpoint: "GET /repos/{owner}/{repo}/branches/{branch}",
            options: { owner, repo, branch },
          });

          if (!branchResponse.data) {
            throw new Error("Failed to fetch branch details.");
          }

          const branchData = branchResponse.data as {
            commit: {
              sha: string;
            };
          };
          const branchSha = branchData.commit.sha;

          // Step 2: Get the current tree (list of files)
          const treeResponse = await fetchWithBQ({
            endpoint: "GET /repos/{owner}/{repo}/git/trees/{tree_sha}",
            options: { owner, repo, tree_sha: branchSha, recursive: "1" },
          });

          if (!treeResponse.data) {
            throw new Error("Failed to fetch tree details.");
          }

          const treeData = treeResponse.data as {
            sha: string;
            tree: TTree[];
          };

          const fileToRename = treeData.tree.filter((file) =>
            file.path?.startsWith(oldFolder),
          );

          if (!fileToRename.length) {
            throw new Error("File to rename not found.");
          }

          // Step 3: Create a new tree with the renamed file
          const newTreeResponse = await fetchWithBQ({
            endpoint: "POST /repos/{owner}/{repo}/git/trees",
            options: {
              owner,
              repo,
              base_tree: branchSha,
              tree: fileToRename
                .map((file) => [
                  {
                    ...file,
                    path: file.path?.replace(oldFolder, newFolder),
                  },
                  {
                    ...file,
                    sha: null,
                  },
                ])
                .flat(),
            },
          });

          if (!newTreeResponse.data) {
            throw new Error("Failed to create a new tree.");
          }
          const newTreeData = newTreeResponse.data as {
            sha: string;
          };

          const newTreeSha = newTreeData.sha;
          // Step 4: Create a new commit with the renamed file
          const commitResponse = await fetchWithBQ({
            endpoint: "POST /repos/{owner}/{repo}/git/commits",
            options: {
              owner,
              repo,
              message: commitMessage,
              author: auth_details,
              committer: auth_details,
              tree: newTreeSha,
              parents: [branchSha],
            },
          });

          if (!commitResponse.data) {
            throw new Error("Failed to create a new commit.");
          }

          const commitData = commitResponse.data as {
            sha: string;
          };
          const commitSha = commitData.sha;
          // Step 5: Update the branch to point to the new commit

          dispatch(
            githubContentApi.util.updateQueryData(
              "getGitHubTrees",
              {
                owner,
                repo,
                tree_sha: branch,
                recursive: "1",
                config: config,
              },
              (draft: TreeCache) => {
                const files = treeData.tree.filter(
                  (file: TTree) => !file.path?.startsWith(oldFolder),
                );
                draft.files = files;
                draft.trees = pathToDir(files, config);
                return draft;
              },
            ),
          );

          return await fetchWithBQ({
            endpoint: "PATCH /repos/{owner}/{repo}/git/refs/{ref}",
            options: {
              owner,
              repo,
              ref: `heads/${branch}`,
              sha: commitSha,
            },
          });
        } catch {}
      },

      async onQueryStarted(arg, { queryFulfilled, dispatch }) {
        try {
          await queryFulfilled;

          // Invalidate all related tags after rename
          dispatch(
            githubApi.util.invalidateTags([
              { type: "GitHubCommit", id: "LIST" },
              "GitHubContent",
              "GitHubComparison",
              "GitHubBranches",
              { type: "GitHubFiles", id: "LIST" },
            ]),
          );
        } catch {
          // Ignore errors
        }
      },
    }),

    /**
     * Reset a GitHub branch to a specific commit
     * This moves the branch pointer to the target commit, effectively undoing all commits after it
     */
    revertToGitHubCommit: build.mutation<
      { sha: string; message: string },
      {
        owner: string;
        repo: string;
        sha: string;
        branch: string;
        token: string;
      }
    >({
      async queryFn(
        { owner, repo, sha, branch, token },
        _api,
        _extraOptions,
        fetchWithBQ,
      ) {
        try {
          logger.debug(
            `[GitHub Revert RTK] Starting reset operation for ${branch}`,
          );

          // Verify the commit exists
          const commitCheck = await fetchWithBQ({
            endpoint: "GET /repos/{owner}/{repo}/commits/{ref}",
            options: { owner, repo, ref: sha, token },
          });

          if (commitCheck.error) {
            return { error: commitCheck.error };
          }

          const targetRef = commitCheck.data as GhCommitRef;
          const targetCommit = targetRef.sha;
          const commitMessage = targetRef.commit?.message ?? "";

          if (!targetCommit) {
            return {
              error: { status: 502, message: "Commit response had no sha" },
            };
          }

          // Get current branch ref
          const branchCheck = await fetchWithBQ({
            endpoint: "GET /repos/{owner}/{repo}/git/refs/{ref}",
            options: { owner, repo, ref: `heads/${branch}`, token },
          });

          if (branchCheck.error) {
            return { error: branchCheck.error };
          }

          const currentSha = (branchCheck.data as GhGitRef).object?.sha;

          if (currentSha === targetCommit) {
            return {
              data: { sha: targetCommit, message: commitMessage },
            };
          }

          // Update the branch reference
          const updateResponse = await fetchWithBQ({
            endpoint: "PATCH /repos/{owner}/{repo}/git/refs/{ref}",
            options: {
              owner,
              repo,
              ref: `heads/${branch}`,
              sha: targetCommit,
              force: true,
              token,
            },
          });

          if (updateResponse.error) {
            return { error: updateResponse.error };
          }

          return {
            data: { sha: targetCommit, message: commitMessage },
          };
        } catch (error) {
          return {
            error: {
              status: errStatus(error) ?? 500,
              message: errMessage(error) ?? "Failed to revert commit",
            },
          };
        }
      },

      invalidatesTags: [{ type: "GitHubCommit", id: "LIST" }, "GitHubBranches"],
      async onQueryStarted(arg, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
          // Force refetch commit queries after successful revert
          dispatch(
            githubCommitApi.util.invalidateTags([
              { type: "GitHubCommit", id: "LIST" },
              "GitHubBranches",
            ]),
          );
        } catch {
          // Error handled by component
        }
      },
    }),

    /**
     * Revert a single GitHub commit (creates a new commit that undoes the changes)
     * This preserves history unlike reset - it creates a new commit with opposite changes
     */
    revertGitHubCommit: build.mutation<
      { sha: string; message: string },
      {
        owner: string;
        repo: string;
        sha: string;
        branch: string;
        token: string;
      }
    >({
      async queryFn(
        { owner, repo, sha, branch, token },
        _api,
        _extraOptions,
        fetchWithBQ,
      ) {
        try {
          logger.debug(
            `[GitHub Revert Single RTK] Starting revert operation for commit ${sha}`,
          );

          // Verify the commit exists
          const commitCheck = await fetchWithBQ({
            endpoint: "GET /repos/{owner}/{repo}/commits/{ref}",
            options: { owner, repo, ref: sha, token },
          });

          if (commitCheck.error) {
            return { error: commitCheck.error };
          }

          const commit = commitCheck.data as GhCommitRef;
          const commitMessage = commit.commit?.message;

          // Get current branch to find the parent and base tree
          const branchCheck = await fetchWithBQ({
            endpoint: "GET /repos/{owner}/{repo}/branches/{branch}",
            options: { owner, repo, branch, token },
          });

          if (branchCheck.error) {
            return { error: branchCheck.error };
          }

          const currentBranch = branchCheck.data as GhBranch;
          const currentSha = currentBranch.commit?.sha;

          // Get the commit's parent
          const parentSha = commit.parents?.[0]?.sha;
          if (!parentSha) {
            return {
              error: {
                status: 400,
                message: "Cannot revert first commit",
              },
            };
          }

          // Get parent tree to reset to
          const parentCommit = await fetchWithBQ({
            endpoint: "GET /repos/{owner}/{repo}/git/commits/{commit_sha}",
            options: { owner, repo, commit_sha: parentSha, token },
          });

          if (parentCommit.error) {
            return { error: parentCommit.error };
          }

          const parentTree = (parentCommit.data as GhGitCommit).tree?.sha;

          // Create revert commit
          const revertCommitMessage = `Revert "${commitMessage?.split("\n")[0] || "commit"}"`;
          const auth_details = {
            name: "Sitepins[bot]",
            email: "sitepins[bot]@users.noreply.github.com",
          };

          const revertCommitResponse = await fetchWithBQ({
            endpoint: "POST /repos/{owner}/{repo}/git/commits",
            options: {
              owner,
              repo,
              message: revertCommitMessage,
              author: auth_details,
              committer: auth_details,
              tree: parentTree,
              parents: [currentSha],
              token,
            },
          });

          if (revertCommitResponse.error) {
            return { error: revertCommitResponse.error };
          }

          const revertCommit = revertCommitResponse.data as GhGitCommit;

          if (!revertCommit.sha) {
            return {
              error: { status: 502, message: "Revert commit had no sha" },
            };
          }

          // Update branch to point to new revert commit
          const updateResponse = await fetchWithBQ({
            endpoint: "PATCH /repos/{owner}/{repo}/git/refs/{ref}",
            options: {
              owner,
              repo,
              ref: `heads/${branch}`,
              sha: revertCommit.sha,
              token,
            },
          });

          if (updateResponse.error) {
            return { error: updateResponse.error };
          }

          return {
            data: {
              sha: revertCommit.sha,
              message: revertCommitMessage,
            },
          };
        } catch (error) {
          return {
            error: {
              status: errStatus(error) ?? 500,
              message: errMessage(error) ?? "Failed to revert commit",
            },
          };
        }
      },

      invalidatesTags: [{ type: "GitHubCommit", id: "LIST" }, "GitHubBranches"],
      async onQueryStarted(arg, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
          dispatch(
            githubCommitApi.util.invalidateTags([
              { type: "GitHubCommit", id: "LIST" },
              "GitHubBranches",
            ]),
          );
        } catch {
          // Error handled by component
        }
      },
    }),
  }),
});

export const {
  useGetGitHubCommitsQuery,
  useGetGitHubCommitStatusQuery,
  useUpdateGitHubFilesMutation,
  useRenameGitHubFolderMutation,
  useRevertToGitHubCommitMutation,
  useRevertGitHubCommitMutation,
} = githubCommitApi;
