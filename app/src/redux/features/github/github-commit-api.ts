import { authClient } from "@/lib/auth/auth-client";
import { GITHUB_APP_NAME, IS_DEMO, SCHEMA_FOLDER } from "@/lib/constant";
import { checkMedia } from "@/lib/utils/check-media-file";
import { parseContentJson } from "@/lib/utils/content-serializer";
import { fmDetector } from "@/lib/utils/frontmatter-detector";
import {
  dedupeFiles,
  filterUploadableFiles,
  runWithConcurrency,
} from "@/lib/utils/git-utils";
import { pathToDir } from "@/lib/utils/path-to-dir";
import { RootState } from "@/redux/store";
import { TTree } from "@/types";
import path from "path";
import { toast } from "sonner";
import { updateConfig } from "../config/slice";
import { userPreferenceApi } from "../user-preference/user-preference-api";
import { githubApi } from "./github-api";
import { githubContentApi } from "./github-content-api";
import { TGitHubOption, TGitHubPromise } from "./github-type";

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

import {
  createGitCommitMessage,
  delay,
  getGitAuthDetails,
  isTransientNetworkError,
  normalizeDeleteCommitMessage,
  toBase64,
} from "@/lib/utils/git-utils";

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

        const existingShas = new Set(currentCache.map((c: any) => c.sha));
        const filteredNewItems = newItems.filter(
          (item: any) => !existingShas.has(item.sha),
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
      any,
      TGitHubOption<"GET /repos/{owner}/{repo}/commits/{ref}/status">
    >({
      query: (arg) => ({
        endpoint: "GET /repos/{owner}/{repo}/commits/{ref}/status",
        options: arg,
      }),
      transformResponse: (response: any) => {
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
        const filteredFiles = filterUploadableFiles(dedupeFiles(files));
        const effectiveMessage = normalizeDeleteCommitMessage(
          message,
          filteredFiles,
        );

        if (filteredFiles.length === 0) {
          return { data: null };
        }

        const { config: storeConfig } = getState() as RootState;
        const hasUserToken = Boolean(storeConfig.currentLoginUserToken);

        // Helper to track whether to use user token (may switch to false on permission errors)
        let useUserToken = hasUserToken;
        const getToken = () =>
          useUserToken ? storeConfig.currentLoginUserToken : storeConfig.token;

        // Fetch user preference for co-authoring
        let impersonate = false;
        try {
          const resolvedSession = await authClient.getSession();
          const userId = resolvedSession?.data?.user?.user_id;
          if (userId) {
            // @ts-ignore - initiate is allowed here
            const prefResult = await dispatch(
              userPreferenceApi.endpoints.getUserPreference.initiate(userId),
            );
            impersonate = prefResult.data?.impersonate ?? false;
          }
        } catch (e) {
          console.warn("Failed to fetch user preferences", e);
        }

        // Helper to check if error is permission-related
        const isPermissionError = (error: any) => {
          const status = error?.status || error?.response?.status;
          const statusNum = Number(status);
          return statusNum === 401 || statusNum === 403;
        };

        try {
          if (IS_DEMO) {
            return { data: null };
          }

          // ============================================================================
          // STEP 2: Get user details and prepare auth info
          // ============================================================================

          // Always fetch session as fallback for email/full_name.
          const sessionUser = (await authClient.getSession())?.data?.user;
          const sessionUserEmail = sessionUser?.email;

          // Fetch authenticated user only when we have a token; otherwise reuse session
          let userResult = useUserToken
            ? await fetchWithBQ({
                endpoint: "GET /user",
                options: { token: storeConfig.currentLoginUserToken },
              })
            : {
                data: {
                  login: sessionUser?.full_name
                    ?.replaceAll(" ", "")
                    .toLowerCase(),
                  email: sessionUser?.email,
                },
              };

          // Retry with session if user token fails with permission error
          if (
            userResult.error &&
            isPermissionError(userResult.error) &&
            useUserToken
          ) {
            useUserToken = false;
            userResult = {
              data: {
                login: sessionUser?.full_name
                  ?.replaceAll(" ", "")
                  .toLowerCase(),
                email: sessionUser?.email,
              },
            };
          }

          if (!userResult.data) {
            throw new Error("Failed to fetch user details.");
          }

          const { login, email } = userResult.data as {
            login: string;
            email?: string | null;
          };

          const auth_details = getGitAuthDetails("Github");
          // sessionEmail already declared above
          // GitHub often returns null email for users with private email.
          // Ensure we still produce a valid co-author email.
          const userEmail =
            email || sessionUserEmail || `${login}@users.noreply.github.com`;

          // Get branch reference and tree SHA
          let baseCommitSha: string | null = null;
          let baseTreeSha: string | null = null;

          try {
            let branchResult = await fetchWithBQ({
              endpoint: `GET /repos/{owner}/{repo}/branches/{branch}?_nocache=${Date.now()}`,
              options: {
                owner,
                repo,
                branch,
                ...(getToken() && { token: getToken() }),
              },
            });

            // Retry with bot identity if permission error
            if (
              branchResult.error &&
              isPermissionError(branchResult.error) &&
              useUserToken
            ) {
              useUserToken = false;
              branchResult = await fetchWithBQ({
                endpoint: `GET /repos/{owner}/{repo}/branches/{branch}?_nocache=${Date.now()}`,
                options: { owner, repo, branch },
              });
            }

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
              const err = branchResult.error as any;
              if (err.status !== 404) {
                throw new Error(
                  `Failed to fetch branch info: ${err.message || err.status}`,
                );
              }
            }
          } catch (e: any) {
            if (e?.status !== 404) throw e;
          }

          // Fallback: fetch tree SHA from commit if missing
          if (baseCommitSha && !baseTreeSha) {
            try {
              let commitResult = await fetchWithBQ({
                endpoint: `GET /repos/{owner}/{repo}/git/commits/{commit_sha}?_nocache=${Date.now()}`,
                options: {
                  owner,
                  repo,
                  commit_sha: baseCommitSha,
                  ...(getToken() && { token: getToken() }),
                },
              });

              // Retry with bot identity if permission error
              if (
                commitResult.error &&
                isPermissionError(commitResult.error) &&
                useUserToken
              ) {
                useUserToken = false;
                commitResult = await fetchWithBQ({
                  endpoint: `GET /repos/{owner}/{repo}/git/commits/{commit_sha}?_nocache=${Date.now()}`,
                  options: { owner, repo, commit_sha: baseCommitSha },
                });
              }

              if (commitResult.data) {
                baseTreeSha =
                  (commitResult.data as { tree?: { sha?: string } }).tree
                    ?.sha || null;
              }
            } catch (_e) {
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
                        let blobResult = await fetchWithBQ({
                          endpoint: "POST /repos/{owner}/{repo}/git/blobs",
                          options: {
                            owner,
                            repo,
                            content: file.content,
                            ...(checkMedia(file.path) &&
                              file.content && { encoding: "base64" }),
                            ...(getToken() && { token: getToken() }),
                          },
                        });

                        // Retry with bot identity if permission error
                        if (
                          blobResult.error &&
                          isPermissionError(blobResult.error) &&
                          useUserToken
                        ) {
                          useUserToken = false;
                          blobResult = await fetchWithBQ({
                            endpoint: "POST /repos/{owner}/{repo}/git/blobs",
                            options: {
                              owner,
                              repo,
                              content: file.content,
                              ...(checkMedia(file.path) &&
                                file.content && { encoding: "base64" }),
                            },
                          });
                        }

                        if (!blobResult.data) {
                          const error = (blobResult as any)?.error || {};

                          // Check if it's a file size error
                          if (error.status === "422" || error.status === 422) {
                            throw new Error(
                              `File "${file.path}" is too large for GitHub's blob API (limit: ~25MB). Please reduce the file size or use Git LFS for large files.`,
                            );
                          }

                          throw new Error(
                            `Failed to create blob for file ${fileIdx + 1}/${batch.length}: ${file.path} (${error.status || ""} ${error.message || ""})`,
                          );
                        }

                        return blobResult.data as { sha: string };
                      } catch (error: any) {
                        if (tryIndex < 3 && isTransientNetworkError(error)) {
                          await delay(200 * (tryIndex + 1));
                          return attempt(tryIndex + 1);
                        }

                        console.error(
                          `Error creating blob for ${file.path} (attempt ${tryIndex + 1}):`,
                          error?.message || error,
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

                let treeResult = await fetchWithBQ({
                  endpoint: "POST /repos/{owner}/{repo}/git/trees",
                  options: {
                    tree: treeData,
                    owner,
                    repo,
                    ...(lastTreeSha && { base_tree: lastTreeSha }),
                    ...(getToken() && { token: getToken() }),
                  },
                });

                // Retry with bot identity if permission error
                if (
                  treeResult.error &&
                  isPermissionError(treeResult.error) &&
                  useUserToken
                ) {
                  useUserToken = false;
                  treeResult = await fetchWithBQ({
                    endpoint: "POST /repos/{owner}/{repo}/git/trees",
                    options: {
                      tree: treeData,
                      owner,
                      repo,
                      ...(lastTreeSha && { base_tree: lastTreeSha }),
                    },
                  });
                }

                if (!treeResult.data) {
                  const error = (treeResult as any)?.error || {};
                  console.error(
                    `Failed to create tree for batch ${batchIndex + 1}:`,
                    {
                      status: error.status,
                      message: error.message,
                      treeSize: treeData.length,
                      baseTreeSha: lastTreeSha,
                      batchFiles: batch.map((f) => f.path),
                    },
                  );
                  throw new Error(
                    `Failed to create tree for batch ${batchIndex + 1}. ${error.message || ""}`,
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
                  !impersonate && useUserToken ? login : undefined,
                  !impersonate && useUserToken ? userEmail : undefined,
                  "Github",
                );

                let commitResult = await fetchWithBQ({
                  endpoint: "POST /repos/{owner}/{repo}/git/commits",
                  options: {
                    owner,
                    repo,
                    message: commitMessage,
                    author: auth_details,
                    committer: auth_details,
                    tree: tree.sha,
                    ...(lastCommitSha ? { parents: [lastCommitSha] } : {}),
                    ...(getToken() && { token: getToken() }),
                  },
                });

                // Retry with bot identity if permission error
                if (
                  commitResult.error &&
                  isPermissionError(commitResult.error) &&
                  useUserToken
                ) {
                  useUserToken = false;
                  // Re-generate commit message without co-author on fallback
                  const fallbackCommitMessage = createGitCommitMessage(
                    batchMessage,
                    description,
                    undefined,
                    undefined,
                    "Github",
                  );

                  commitResult = await fetchWithBQ({
                    endpoint: "POST /repos/{owner}/{repo}/git/commits",
                    options: {
                      owner,
                      repo,
                      message: fallbackCommitMessage,
                      author: auth_details,
                      committer: auth_details,
                      tree: tree.sha,
                      ...(lastCommitSha ? { parents: [lastCommitSha] } : {}),
                      ...(getToken() && { token: getToken() }),
                    },
                  });
                }

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
                  let refResult = await fetchWithBQ({
                    endpoint: "POST /repos/{owner}/{repo}/git/refs",
                    options: {
                      owner,
                      repo,
                      ref: "refs/heads/" + branch,
                      sha: commit.sha,
                      ...(getToken() && { token: getToken() }),
                    },
                  });

                  // Retry with bot identity if permission error
                  if (
                    refResult.error &&
                    isPermissionError(refResult.error) &&
                    useUserToken
                  ) {
                    useUserToken = false;
                    refResult = await fetchWithBQ({
                      endpoint: "POST /repos/{owner}/{repo}/git/refs",
                      options: {
                        owner,
                        repo,
                        ref: "refs/heads/" + branch,
                        sha: commit.sha,
                      },
                    });
                  }
                } else {
                  // Update ref
                  let refResult = await fetchWithBQ({
                    endpoint: "PATCH /repos/{owner}/{repo}/git/refs/{ref}",
                    options: {
                      sha: commit.sha,
                      force: true,
                      ref: "heads/" + branch,
                      owner,
                      repo,
                      ...(getToken() && { token: getToken() }),
                    },
                  });

                  // Retry with bot identity if permission error
                  if (
                    refResult.error &&
                    isPermissionError(refResult.error) &&
                    useUserToken
                  ) {
                    useUserToken = false;
                    refResult = await fetchWithBQ({
                      endpoint: "PATCH /repos/{owner}/{repo}/git/refs/{ref}",
                      options: {
                        sha: commit.sha,
                        force: true,
                        ref: "heads/" + branch,
                        owner,
                        repo,
                      },
                    });
                  }
                }

                // Update the base SHA and tree SHA for the next batch
                lastCommitSha = commit.sha;
                lastTreeSha = commit.tree.sha;

                break;
              } catch (err: any) {
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
        } catch (error: any) {
          // ============================================================================
          // FALLBACK: Use Contents API (slower but more reliable for problematic repos)
          // ============================================================================
          console.warn(
            "Low-level Git API failed; falling back to Contents API.",
            error?.message || error,
          );

          const sessionUser = useUserToken
            ? null
            : (() => {
                const session = authClient.getSession();
                return session instanceof Promise
                  ? session
                  : Promise.resolve(session);
              })();

          const resolvedSession = useUserToken ? null : await sessionUser;
          const user = resolvedSession?.data?.user;

          // Get user details for commit attribution
          const userResult = useUserToken
            ? await fetchWithBQ({
                endpoint: "GET /user",
                options: { token: storeConfig.currentLoginUserToken },
              })
            : {
                data: {
                  login: user?.full_name?.replaceAll(" ", "").toLowerCase(),
                  email: user?.email,
                },
              };

          if (!userResult.data) {
            throw new Error("Failed to fetch user details for fallback.");
          }

          const { login, email } = userResult.data as {
            login: string;
            email: string;
          };

          const auth_details = getGitAuthDetails("Github");
          const userEmail = email || user?.email;

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
                !impersonate && useUserToken ? login : undefined,
                !impersonate && useUserToken ? userEmail : undefined,
                "Github",
              );

              try {
                // Check if file already exists to get its SHA
                let existingSha: string | undefined;
                try {
                  let headRes = await fetchWithBQ({
                    endpoint: `GET /repos/{owner}/{repo}/contents/{path}?_nocache=${Date.now()}`,
                    options: {
                      owner,
                      repo,
                      path: file.path,
                      ref: branch,
                      ...(getToken() && { token: getToken() }),
                    },
                  });

                  // Retry with bot identity if permission error
                  if (
                    headRes.error &&
                    isPermissionError(headRes.error) &&
                    useUserToken
                  ) {
                    useUserToken = false;
                    headRes = await fetchWithBQ({
                      endpoint: `GET /repos/{owner}/{repo}/contents/{path}?_nocache=${Date.now()}`,
                      options: {
                        owner,
                        repo,
                        path: file.path,
                        ref: branch,
                      },
                    });
                  }
                  existingSha = (headRes as any)?.data?.sha;
                } catch (_e) {
                  // File doesn't exist yet, that's okay
                  existingSha = undefined;
                }

                if (file.delete) {
                  // Delete the file using Contents API (requires sha)
                  if (!existingSha) {
                    continue;
                  }

                  let deleteRes = await fetchWithBQ({
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
                      ...(getToken() && { token: getToken() }),
                    },
                  });

                  // Retry with bot identity if permission error
                  if (
                    deleteRes.error &&
                    isPermissionError(deleteRes.error) &&
                    useUserToken
                  ) {
                    useUserToken = false;
                    // Re-generate commit message without co-author on fallback
                    const fallbackCommitMessage = createGitCommitMessage(
                      batchMessage,
                      description,
                      undefined,
                      undefined,
                      "Github",
                    );

                    deleteRes = await fetchWithBQ({
                      endpoint: "DELETE /repos/{owner}/{repo}/contents/{path}",
                      options: {
                        owner,
                        repo,
                        path: file.path,
                        message: fallbackCommitMessage,
                        branch,
                        sha: existingSha,
                        author: auth_details,
                        committer: auth_details,
                        ...(getToken() && { token: getToken() }),
                      },
                    });
                  }

                  if (!deleteRes.data) {
                    console.error(
                      "Contents API delete failed for",
                      file.path,
                      (deleteRes as any)?.error || {},
                    );
                    throw new Error(`Failed to delete ${file.path}`);
                  }

                  const commitInfo = (deleteRes.data as any)?.commit;
                  if (commitInfo?.sha) {
                    lastCommitSha = commitInfo.sha;
                  }
                  continue;
                }

                // Now create or update the file
                let putRes = await fetchWithBQ({
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
                    ...(getToken() && { token: getToken() }),
                  },
                });

                // Retry with bot identity if permission error
                if (
                  putRes.error &&
                  isPermissionError(putRes.error) &&
                  useUserToken
                ) {
                  useUserToken = false;
                  // Re-generate commit message without co-author on fallback
                  const fallbackCommitMessage = createGitCommitMessage(
                    batchMessage,
                    description,
                    undefined,
                    undefined,
                    "Github",
                  );

                  putRes = await fetchWithBQ({
                    endpoint: "PUT /repos/{owner}/{repo}/contents/{path}",
                    options: {
                      owner,
                      repo,
                      path: file.path,
                      message: fallbackCommitMessage,
                      branch,
                      author: auth_details,
                      committer: auth_details,
                      content: contentBase64,
                      ...(existingSha && { sha: existingSha }),
                      ...(getToken() && { token: getToken() }),
                    },
                  });
                }

                if (!putRes.data) {
                  const err = (putRes as any)?.error || {};
                  console.error(
                    "Contents API upload failed for",
                    file.path,
                    err,
                  );
                  throw new Error(
                    err.message || `Failed to upload ${file.path}`,
                  );
                }

                const commitInfo = (putRes.data as any)?.commit;
                if (commitInfo?.sha) {
                  lastCommitSha = commitInfo.sha;
                }
              } catch (fileError: any) {
                console.error(
                  `✗ Failed to process ${file.path}:`,
                  fileError.message,
                );
                // Continue with next file instead of stopping the entire upload
              }
            }
          }

          if (!lastCommitSha) {
            throw new Error(
              "Upload failed. Please check if you have permission to commit to this repository.",
            );
          }

          return { data: { sha: lastCommitSha } } as any;
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
            if ((file as any).delete) {
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
                    () => undefined as any,
                  ),
                );
              } catch (_e) {}

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
                    (draft: any) => {
                      if (!draft || !draft.files) return draft;
                      const newFiles = (draft.files || []).filter(
                        (t: any) => t.path !== file.path,
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
              } catch (_e) {}

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
                      (draft: any) => {
                        if (!Array.isArray(draft)) return draft;
                        return draft.filter((f: any) => f.path !== file.path);
                      },
                    ),
                  );
                }
              } catch (_e) {}

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
              } catch (e) {
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
                    (draft: any) => {
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
                  (draft: any) => {
                    let pathTrees = draft.files.filter(
                      (tree: any) => tree.path !== file.path,
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
                  (draft: any) => {
                    let pathTrees = draft.files.filter(
                      (tree: any) => tree.path !== file.path,
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
        } catch ({ error }: any) {
          toast.error(error.message);
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
              (draft: any) => {
                const files = treeData.tree.filter(
                  (file: any) => !file.path?.startsWith(oldFolder),
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
        } catch (_error) {}
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
        } catch (error) {
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
          console.log(
            `[GitHub Revert RTK] Starting reset operation for ${branch}`,
          );

          // Verify the commit exists
          const commitCheck = await fetchWithBQ({
            endpoint: "GET /repos/{owner}/{repo}/commits/{ref}",
            options: { owner, repo, ref: sha, token },
          });

          if (commitCheck.error) {
            return { error: commitCheck.error as any };
          }

          const targetCommit = (commitCheck.data as any).sha;
          const commitMessage = (commitCheck.data as any).commit?.message;

          // Get current branch ref
          const branchCheck = await fetchWithBQ({
            endpoint: "GET /repos/{owner}/{repo}/git/refs/{ref}",
            options: { owner, repo, ref: `heads/${branch}`, token },
          });

          if (branchCheck.error) {
            return { error: branchCheck.error as any };
          }

          const currentSha = (branchCheck.data as any).object?.sha;

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
            return { error: updateResponse.error as any };
          }

          return {
            data: { sha: targetCommit, message: commitMessage },
          };
        } catch (error: any) {
          return {
            error: {
              status: error?.status || 500,
              message: error?.message || "Failed to revert commit",
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
        } catch (e) {
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
          console.log(
            `[GitHub Revert Single RTK] Starting revert operation for commit ${sha}`,
          );

          // Verify the commit exists
          const commitCheck = await fetchWithBQ({
            endpoint: "GET /repos/{owner}/{repo}/commits/{ref}",
            options: { owner, repo, ref: sha, token },
          });

          if (commitCheck.error) {
            return { error: commitCheck.error as any };
          }

          const commit = commitCheck.data as any;
          const commitMessage = commit.commit?.message;
          const commitSha = commit.sha;

          // Get current branch to find the parent and base tree
          const branchCheck = await fetchWithBQ({
            endpoint: "GET /repos/{owner}/{repo}/branches/{branch}",
            options: { owner, repo, branch, token },
          });

          if (branchCheck.error) {
            return { error: branchCheck.error as any };
          }

          const currentBranch = branchCheck.data as any;
          const currentSha = currentBranch.commit.sha;
          const currentTree = currentBranch.commit.commit?.tree?.sha;

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
            return { error: parentCommit.error as any };
          }

          const parentTree = (parentCommit.data as any).tree?.sha;

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
            return { error: revertCommitResponse.error as any };
          }

          const revertCommit = revertCommitResponse.data as any;

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
            return { error: updateResponse.error as any };
          }

          return {
            data: {
              sha: revertCommit.sha,
              message: revertCommitMessage,
            },
          };
        } catch (error: any) {
          return {
            error: {
              status: error?.status || 500,
              message: error?.message || "Failed to revert commit",
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
        } catch (e) {
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
