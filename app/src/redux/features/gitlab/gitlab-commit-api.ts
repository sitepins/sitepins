import { authClient } from "@/lib/auth/auth-client";
import { IS_DEMO, SCHEMA_FOLDER } from "@/lib/constant";
import { checkMedia } from "@/lib/utils/check-media-file";
import { parseContentJson } from "@/lib/utils/content-serializer";
import { fmDetector } from "@/lib/utils/frontmatter-detector";
import { dedupeFiles, filterUploadableFiles } from "@/lib/utils/git-utils";
import { pathToDir } from "@/lib/utils/path-to-dir";
import { RootState } from "@/redux/store";
import path from "path";
import { toast } from "sonner";
import { updateConfig } from "../config/slice";
import { userPreferenceApi } from "../user-preference/user-preference-api";
import { encodeProjectPath, gitlabApi } from "./gitlab-api";
import { gitlabContentApi } from "./gitlab-content-api";
import {
  TGitLabCommit,
  TGitLabCommitAction,
  TGitLabCreateCommitResponse,
  TGitLabPipeline,
} from "./gitlab-type";

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

import {
  createGitCommitMessage,
  getGitAuthDetails,
  normalizeDeleteCommitMessage,
} from "@/lib/utils/git-utils";

/**
 * Convert file operations to GitLab commit actions
 */
function convertToGitLabActions(
  files: Array<{ path: string; content?: string; delete?: boolean }>,
  existingFiles: Set<string>,
): TGitLabCommitAction[] {
  return files.map((file) => {
    if (file.delete) {
      return {
        action: "delete" as const,
        file_path: file.path,
      };
    }

    const isUpdate = existingFiles.has(file.path);
    const isMedia = checkMedia(file.path);

    return {
      action: isUpdate ? ("update" as const) : ("create" as const),
      file_path: file.path,
      content: file.content || "",
      encoding: isMedia ? ("base64" as const) : ("text" as const),
    };
  });
}

// ============================================================================
// API ENDPOINTS
// ============================================================================

export const gitlabCommitApi = gitlabApi.injectEndpoints({
  // Allow re-injecting endpoints during HMR/dev without warnings
  overrideExisting: true,
  endpoints: (build) => ({
    /**
     * Get commit history for a GitLab repository
     */
    getGitLabCommits: build.query<
      TGitLabCommit[],
      {
        id: string | number;
        ref?: string;
        path?: string;
        per_page?: number;
        page?: number;
      }
    >({
      query: ({ id, ref, path: filePath, per_page = 20, page = 1 }) => ({
        endpoint: `/projects/${encodeProjectPath(String(id))}/repository/commits`,
        params: {
          ref_name: ref,
          path: filePath,
          per_page,
          page,
        },
      }),
      providesTags(result, _error, arg) {
        const tags: any[] = [{ type: "GitLabCommit", id: "LIST" }];
        if (arg.path) {
          tags.push({ type: "GitLabCommit", id: `${arg.path}` });
        }
        return tags;
      },
      serializeQueryArgs: ({ queryArgs }) => {
        const { id, ref, path } = queryArgs;
        return { id, ref, path };
      },
      merge(currentCache, newItems, { arg }) {
        if (!newItems || !Array.isArray(newItems)) return currentCache;
        if (!currentCache || !Array.isArray(currentCache) || arg?.page === 1) {
          return newItems;
        }

        const existingIds = new Set(currentCache.map((c: any) => c.id));
        const filteredNewItems = newItems.filter(
          (item: any) => !existingIds.has(item.id),
        );
        return [...currentCache, ...filteredNewItems];
      },
      forceRefetch({ currentArg, previousArg }) {
        return (
          currentArg?.path !== previousArg?.path ||
          currentArg?.ref !== previousArg?.ref ||
          currentArg?.page !== previousArg?.page
        );
      },
    }),

    /**
     * Create a commit with multiple file changes in GitLab
     */
    updateGitLabFiles: build.mutation<
      TGitLabCreateCommitResponse | null,
      {
        id: string | number;
        branch: string;
        files: Array<{ path: string; content?: string; delete?: boolean }>;
        message: string;
        description?: string;
      }
    >({
      // @ts-ignore - complex queryFn
      async queryFn(
        { id, branch, files, message, description },
        { getState, dispatch },
        _extraOptions,
        fetchWithBQ,
      ) {
        const filteredFiles = filterUploadableFiles(dedupeFiles(files));
        const effectiveMessage = normalizeDeleteCommitMessage(
          message,
          filteredFiles,
        );

        if (filteredFiles.length === 0) {
          return { data: null };
        }

        const { config: storeConfig } = getState() as RootState;

        // Helper to track whether to use user token (may switch to false on permission errors)
        let useUserToken = Boolean(storeConfig.currentLoginUserToken);
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

          const resolvedSession = await authClient.getSession();
          const sessionUser = resolvedSession?.data?.user;

          let userResult = useUserToken
            ? await fetchWithBQ({
                endpoint: "/user",
                token: storeConfig.currentLoginUserToken,
              })
            : {
                data: {
                  username: sessionUser?.full_name
                    ?.replaceAll(" ", "")
                    .toLowerCase(),
                  email: sessionUser?.email,
                  name: sessionUser?.full_name,
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
                username: sessionUser?.full_name
                  ?.replaceAll(" ", "")
                  .toLowerCase(),
                email: sessionUser?.email,
                name: sessionUser?.full_name,
              },
            };
          }

          if (!userResult.data) {
            throw new Error("Failed to fetch user details.");
          }

          const userData = userResult.data as {
            username?: string;
            email?: string;
            name?: string;
          };

          const auth_details = getGitAuthDetails("Gitlab");

          let existingFiles = new Set<string>();
          try {
            let treeResult = await fetchWithBQ({
              endpoint: `/projects/${encodeProjectPath(String(id))}/repository/tree`,
              params: {
                ref: branch,
                recursive: true,
                per_page: 1000,
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
                endpoint: `/projects/${encodeProjectPath(String(id))}/repository/tree`,
                params: {
                  ref: branch,
                  recursive: true,
                  per_page: 1000,
                },
              });
            }

            if (treeResult.data && Array.isArray(treeResult.data)) {
              existingFiles = new Set(
                (treeResult.data as Array<{ path: string; type: string }>)
                  .filter((item) => item.type === "blob")
                  .map((item) => item.path),
              );
            }
          } catch (_e) {
            // If tree fetch fails, assume all files are new
          }

          const actions = convertToGitLabActions(filteredFiles, existingFiles);

          const commitMessage = createGitCommitMessage(
            `${effectiveMessage} by Sitepins`,
            description,
            !impersonate && useUserToken
              ? userData.name || userData.username
              : undefined,
            !impersonate && useUserToken ? userData.email : undefined,
            "Gitlab",
          );

          let commitResult = await fetchWithBQ({
            endpoint: `/projects/${encodeProjectPath(String(id))}/repository/commits`,
            method: "POST",
            body: {
              branch,
              commit_message: commitMessage,
              author_email: auth_details.email,
              author_name: auth_details.name,
              actions,
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
              `${effectiveMessage} by Sitepins`,
              description,
              undefined,
              undefined,
              "Gitlab",
            );

            commitResult = await fetchWithBQ({
              endpoint: `/projects/${encodeProjectPath(String(id))}/repository/commits`,
              method: "POST",
              body: {
                branch,
                commit_message: fallbackCommitMessage,
                author_email: auth_details.email,
                author_name: auth_details.name,
                actions,
                ...(getToken() && { token: getToken() }),
              },
            });
          }

          if (!commitResult.data) {
            const error = commitResult.error as
              | { message?: string }
              | undefined;
            throw new Error(
              error?.message || "Failed to create commit in GitLab.",
            );
          }

          return { data: commitResult.data as TGitLabCreateCommitResponse };
        } catch (error: unknown) {
          const err = error as Error;
          console.error("GitLab commit error:", err.message || err);
          return {
            error: {
              status: 500,
              message: err.message || "Failed to commit files to GitLab",
            },
          };
        }
      },

      // invalidatesTags: () => [{ type: "GitLabFiles", id: "LIST" }],

      async onQueryStarted(arg, { queryFulfilled, dispatch, getState }) {
        const { config: storeConfig } = getState() as RootState;

        try {
          await queryFulfilled;

          dispatch(
            gitlabCommitApi.util.invalidateTags([
              { type: "GitLabCommit", id: "LIST" },
              "GitLabComparison",
              "GitLabCommitStatus",
            ]),
          );

          arg.files.forEach((file) => {
            if ((file as { delete?: boolean }).delete) {
              try {
                dispatch(
                  gitlabContentApi.util.updateQueryData(
                    "getGitLabContent",
                    {
                      id: arg.id,
                      file_path: file.path,
                      ref: arg.branch,
                      parser: true,
                    },
                    () => undefined as unknown as Record<string, unknown>,
                  ),
                );
              } catch (_e) {
                // Ignore cache update errors
              }
            } else if (file.path === ".sitepins/config.json" && file.content) {
              try {
                const config = JSON.parse(file.content);
                dispatch(updateConfig(config));
                dispatch(
                  gitlabContentApi.util.updateQueryData(
                    "getGitLabTrees",
                    {
                      id: String(storeConfig.owner),
                      ref: storeConfig.branch,
                      recursive: true,
                      config: storeConfig,
                    },
                    (draft) => {
                      draft.trees = pathToDir(draft.files as any, {
                        ...storeConfig,
                        ...config,
                      });
                      return draft;
                    },
                  ),
                );
              } catch (_e) {
                // Ignore parse errors
              }
            } else if (file.path.startsWith(storeConfig.content) && IS_DEMO) {
              const fm = file.content
                ? fmDetector(file.content, path.parse(file.path).ext)
                : undefined;
              const parsedContent =
                file.content && fm
                  ? parseContentJson(file.content, fm)
                  : undefined;

              if (file.content !== undefined) {
                dispatch(
                  gitlabContentApi.util.upsertQueryData(
                    "getGitLabContent",
                    {
                      id: arg.id,
                      file_path: file.path,
                      ref: arg.branch,
                      parser: false,
                    },
                    {
                      data: file.content,
                      content: file.content,
                    },
                  ),
                );
              }

              if (
                file.content &&
                file.path.startsWith(storeConfig.content) &&
                parsedContent
              ) {
                dispatch(
                  gitlabContentApi.util.upsertQueryData(
                    "getGitLabContent",
                    {
                      id: arg.id,
                      file_path: file.path,
                      ref: arg.branch,
                      parser: true,
                    },
                    {
                      data: { ...parsedContent.data },
                      content: parsedContent.content,
                      fmType: fm,
                    },
                  ),
                );
              }
            } else if (file.path.startsWith(SCHEMA_FOLDER) && IS_DEMO) {
              if (file.content) {
                const fm = fmDetector(file.content, path.parse(file.path).ext);
                const parsedContent = parseContentJson(file.content, fm);
                dispatch(
                  gitlabContentApi.util.upsertQueryData(
                    "getGitLabContent",
                    {
                      id: arg.id,
                      file_path: file.path,
                      ref: arg.branch,
                      parser: true,
                    },
                    {
                      data: { ...parsedContent.data },
                      content: null,
                      fmType: "json",
                      startWith: "---",
                    },
                  ),
                );
              }
            }
          });
        } catch (err: unknown) {
          const error = err as { error?: { message?: string } };
          toast.error(error?.error?.message || "Failed to commit files");
        }
      },
    }),

    /**
     * Rename a folder in GitLab repository
     */
    renameGitLabFolder: build.mutation<
      TGitLabCreateCommitResponse,
      {
        id: string | number;
        branch: string;
        oldFolder: string;
        newFolder: string;
        message: string;
        description?: string;
      }
    >({
      // @ts-ignore - complex queryFn
      async queryFn(
        { id, branch, oldFolder, newFolder, message, description },
        { getState, dispatch },
        _extraOptions,
        fetchWithBQ,
      ) {
        const { config: storeConfig } = getState() as RootState;

        // Helper to track whether to use user token (may switch to false on permission errors)
        let useUserToken = Boolean(storeConfig.currentLoginUserToken);
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
          const { data: auth } = await authClient.getSession();
          const user = auth?.user;

          let userResult = useUserToken
            ? await fetchWithBQ({
                endpoint: "/user",
                token: storeConfig.currentLoginUserToken,
              })
            : {
                data: {
                  username: user?.full_name?.replaceAll(" ", "").toLowerCase(),
                  email: user?.email,
                  name: user?.full_name,
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
                username: user?.full_name?.replaceAll(" ", "").toLowerCase(),
                email: user?.email,
                name: user?.full_name,
              },
            };
          }

          if (!userResult.data) {
            throw new Error("Failed to fetch user details.");
          }

          const userData = userResult.data as {
            username?: string;
            email?: string;
            name?: string;
          };

          const auth_details = getGitAuthDetails("Gitlab");

          let treeResult = await fetchWithBQ({
            endpoint: `/projects/${encodeProjectPath(String(id))}/repository/tree`,
            params: {
              ref: branch,
              path: oldFolder,
              recursive: true,
              per_page: 1000,
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
              endpoint: `/projects/${encodeProjectPath(String(id))}/repository/tree`,
              params: {
                ref: branch,
                path: oldFolder,
                recursive: true,
                per_page: 1000,
              },
            });
          }

          if (!treeResult.data || !Array.isArray(treeResult.data)) {
            throw new Error("Failed to fetch folder contents.");
          }

          const filesToRename = (
            treeResult.data as Array<{ path: string; type: string }>
          ).filter((item) => item.type === "blob");

          if (filesToRename.length === 0) {
            throw new Error("No files found in folder to rename.");
          }

          const actions: TGitLabCommitAction[] = filesToRename.map((file) => ({
            action: "move" as const,
            file_path: file.path.replace(oldFolder, newFolder),
            previous_path: file.path,
          }));

          const hasUserToken = Boolean(storeConfig.currentLoginUserToken);
          const commitMessage = createGitCommitMessage(
            `${message} by Sitepins`,
            description,
            !impersonate && useUserToken
              ? userData.name || userData.username
              : undefined,
            !impersonate && useUserToken ? userData.email : undefined,
            "Gitlab",
          );

          let commitResult = await fetchWithBQ({
            endpoint: `/projects/${encodeProjectPath(String(id))}/repository/commits`,
            method: "POST",
            body: {
              branch,
              commit_message: commitMessage,
              author_email: auth_details.email,
              author_name: auth_details.name,
              actions,
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
              `${message} by Sitepins`,
              description,
              undefined,
              undefined,
              "Gitlab",
            );

            commitResult = await fetchWithBQ({
              endpoint: `/projects/${encodeProjectPath(String(id))}/repository/commits`,
              method: "POST",
              body: {
                branch,
                commit_message: fallbackCommitMessage,
                author_email: auth_details.email,
                author_name: auth_details.name,
                actions,
                ...(getToken() && { token: getToken() }),
              },
            });
          }

          if (!commitResult.data) {
            throw new Error("Failed to rename folder in GitLab.");
          }

          dispatch(
            gitlabContentApi.util.updateQueryData(
              "getGitLabTrees",
              {
                id: String(id),
                ref: branch,
                recursive: true,
                config: storeConfig,
              },
              (draft) => {
                const files = draft.files.filter(
                  (file) => !file.path?.startsWith(oldFolder),
                );
                draft.files = files;
                draft.trees = pathToDir(files as any, storeConfig);
                return draft;
              },
            ),
          );

          return { data: commitResult.data as TGitLabCreateCommitResponse };
        } catch (error: unknown) {
          const err = error as Error;
          return {
            error: {
              status: 500,
              message: err.message || "Failed to rename folder",
            },
          };
        }
      },
    }),

    getGitLabCommitStatus: build.query<
      string | undefined,
      { id: string; sha?: string; ref?: string }
    >({
      query: ({ id, sha, ref }) => {
        const params = new URLSearchParams();
        if (sha) params.append("sha", sha);
        if (ref) params.append("ref", ref);

        return {
          endpoint: `/projects/${encodeProjectPath(id)}/pipelines?${params.toString()}`,
          method: "GET",
        };
      },
      transformResponse: (response: TGitLabPipeline[]) => {
        if (response && response.length > 0) {
          return response[0].status;
        }
        // Empty pipeline list means no CI is configured on this repo.
        // Return a sentinel so isTerminalDeploymentStatus can stop polling.
        return "no_status";
      },
      providesTags: (result, error, arg) => [
        { type: "GitLabCommit", id: arg.sha || arg.ref || "LATEST" },
        "GitLabCommitStatus",
      ],
    }),

    /**
     * Reset a GitLab branch to a specific commit
     * This moves the branch pointer to the target commit, effectively undoing all commits after it
     * For default branches, creates a new commit with the target state instead of deleting/recreating
     */
    revertToGitLabCommit: build.mutation<
      { sha: string; message: string },
      {
        projectId: string;
        sha: string;
        branch: string;
        token: string;
      }
    >({
      async queryFn(
        { projectId, sha, branch, token },
        _api,
        _extraOptions,
        fetchWithBQ,
      ) {
        try {
          console.log(
            `[GitLab Revert RTK] Starting reset operation for ${branch}`,
          );

          const encodedProjectId = encodeProjectPath(projectId);

          // Verify the commit exists
          const commitCheck = await fetchWithBQ({
            endpoint: `/projects/${encodedProjectId}/repository/commits/${sha}`,
            method: "GET",
            token,
          });

          if (commitCheck.error) {
            return { error: commitCheck.error as any };
          }

          const commit = commitCheck.data as any;

          // Get current branch
          const branchCheck = await fetchWithBQ({
            endpoint: `/projects/${encodedProjectId}/repository/branches/${encodeURIComponent(
              branch,
            )}`,
            method: "GET",
            token,
          });

          if (branchCheck.error) {
            return { error: branchCheck.error as any };
          }

          const branchData = branchCheck.data as any;

          if (branchData.commit?.id === sha) {
            return {
              data: { sha, message: commit.message },
            };
          }

          // Use safe, diff-based reset for all branches (default and non-default)
          // This creates a new commit to restore project state, preserving history and avoiding branch deletion risk.
          console.log(
            `[GitLab Revert RTK] Using safe diff-based reset for branch: ${branch}`,
          );

          const auth_details = getGitAuthDetails("Gitlab");
          const currentSha = branchData.commit?.id;

          if (!currentSha) {
            return {
              error: {
                status: 400,
                message: "Could not determine current branch HEAD",
              },
            };
          }

          // Get diff between current HEAD and target commit
          const compareRes = await fetchWithBQ({
            endpoint: `/projects/${encodedProjectId}/repository/compare`,
            params: {
              from: sha,
              to: currentSha,
            },
          });

          if (compareRes.error) {
            return {
              error: {
                status: compareRes.error?.status || 500,
                message: "Failed to compare commits",
              },
            };
          }

          const compareData = compareRes.data as any;
          const diffs = compareData.diffs || [];

          if (diffs.length === 0) {
            // No changes needed
            return {
              data: { sha, message: commit.message },
            };
          }

          const actions: TGitLabCommitAction[] = [];

          // Process each changed file to UNDO changes made since the target commit
          for (const diff of diffs) {
            if (diff.new_file) {
              // File was added since target commit, so remove it
              actions.push({
                action: "delete" as const,
                file_path: diff.new_path,
              });
            } else if (diff.deleted_file) {
              // File was deleted since target commit, so recreate it from target commit
              const fileRes = await fetchWithBQ({
                endpoint: `/projects/${encodedProjectId}/repository/files/${encodeURIComponent(
                  diff.old_path,
                )}`,
                params: { ref: sha },
              });

              if (!fileRes.error && fileRes.data) {
                const fileData = fileRes.data as any;
                const isMedia = checkMedia(diff.old_path);
                let content = fileData.content || "";
                if (!isMedia && fileData.encoding === "base64") {
                  try {
                    content = Buffer.from(content, "base64").toString("utf-8");
                  } catch (_e) {}
                }

                actions.push({
                  action: "create" as const,
                  file_path: diff.old_path,
                  content,
                  encoding: isMedia ? ("base64" as const) : ("text" as const),
                });
              }
            } else if (diff.renamed_file) {
              // File was renamed since target commit, so revert rename
              // 1. Delete the new path
              actions.push({
                action: "delete" as const,
                file_path: diff.new_path,
              });

              // 2. Re-create the old path from target commit content
              const fileRes = await fetchWithBQ({
                endpoint: `/projects/${encodedProjectId}/repository/files/${encodeURIComponent(
                  diff.old_path,
                )}`,
                params: { ref: sha },
              });

              if (!fileRes.error && fileRes.data) {
                const fileData = fileRes.data as any;
                const isMedia = checkMedia(diff.old_path);
                let content = fileData.content || "";
                if (!isMedia && fileData.encoding === "base64") {
                  try {
                    content = Buffer.from(content, "base64").toString("utf-8");
                  } catch (_e) {}
                }

                actions.push({
                  action: "create" as const,
                  file_path: diff.old_path,
                  content,
                  encoding: isMedia ? ("base64" as const) : ("text" as const),
                });
              }
            } else {
              // File was modified, fetch content from target commit and update
              const filePath = diff.new_path || diff.old_path || diff.path;
              const fileRes = await fetchWithBQ({
                endpoint: `/projects/${encodedProjectId}/repository/files/${encodeURIComponent(
                  filePath,
                )}`,
                params: { ref: sha },
              });

              if (!fileRes.error && fileRes.data) {
                const fileData = fileRes.data as any;
                const isMedia = checkMedia(filePath);
                let content = fileData.content || "";
                if (!isMedia && fileData.encoding === "base64") {
                  try {
                    content = Buffer.from(content, "base64").toString("utf-8");
                  } catch (_e) {}
                }

                actions.push({
                  action: "update" as const,
                  file_path: filePath,
                  content,
                  encoding: isMedia ? ("base64" as const) : ("text" as const),
                });
              }
            }
          }

          if (actions.length === 0) {
            return {
              data: { sha, message: commit.message },
            };
          }

          // Create commit with only changed files
          const commitMessage = createGitCommitMessage(
            `Reset branch to commit by Sitepins`,
            `Reset to ${sha.substring(0, 7)}: ${commit.message}`,
            undefined,
            undefined,
            "Gitlab",
          );

          const commitRes = await fetchWithBQ({
            endpoint: `/projects/${encodedProjectId}/repository/commits`,
            method: "POST",
            body: {
              branch,
              commit_message: commitMessage,
              author_email: auth_details.email,
              author_name: auth_details.name,
              actions,
            },
          });

          if (commitRes.error) {
            return { error: commitRes.error as any };
          }

          const resultCommit = commitRes.data as any;
          const resetSha = resultCommit.id || resultCommit.commit?.id || sha;

          return {
            data: {
              sha: resetSha,
              message: commit.message,
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

      invalidatesTags: [{ type: "GitLabCommit", id: "LIST" }, "GitLabBranches"],
      async onQueryStarted(arg, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
          // Force refetch commit queries after successful revert
          dispatch(
            gitlabCommitApi.util.invalidateTags([
              { type: "GitLabCommit", id: "LIST" },
              "GitLabBranches",
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
  useGetGitLabCommitsQuery,
  useUpdateGitLabFilesMutation,
  useRenameGitLabFolderMutation,
  useGetGitLabCommitStatusQuery,
  useRevertToGitLabCommitMutation,
} = gitlabCommitApi;
