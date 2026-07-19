import { GITHUB_API_VERSION, GITLAB_API_VERSION } from "@/lib/constant";
import { checkMedia } from "@/lib/utils/check-media-file";
import { isGitLabProvider } from "@/lib/utils/provider-checker";
import { useUpdateGitHubFilesMutation } from "@/redux/features/github";
import { useUpdateGitLabFilesMutation } from "@/redux/features/gitlab";
import { useAddProjectLogMutation } from "@/redux/features/project-log/project-log-api";
import { EAction, EProjectLogType } from "@/redux/features/project-log/type";
import { TFiles } from "@/types";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

interface Config {
  owner?: string;
  repoName?: string;
  branch?: string;
  provider?: string;
  currentLoginUserToken?: string;
  token?: string;
}

interface UseFolderOpsProps {
  config: Config;
  repoFiles: TFiles[];
  projectId: string;
  userId: string;
}

export function useFolderOps({
  config,
  repoFiles,
  projectId,
  userId,
}: UseFolderOpsProps) {
  const [updateGitHubFiles, { isLoading: isGhLoading }] =
    useUpdateGitHubFilesMutation();
  const [updateGitLabFiles, { isLoading: isGlLoading }] =
    useUpdateGitLabFilesMutation();
  const [addLog] = useAddProjectLogMutation();
  const tFeedback = useTranslations("common.feedback");

  const isLoading = isGitLabProvider(config.provider)
    ? isGlLoading
    : isGhLoading;

  const fetchFileContent = async (file: {
    oldPath: string;
    newPath: string;
  }) => {
    try {
      const isMedia = checkMedia(file.oldPath);

      if (isGitLabProvider(config.provider)) {
        const response = await fetch(
          `https://gitlab.com/api/${GITLAB_API_VERSION}/projects/${encodeURIComponent(
            config.repoName
              ? `${config.owner}/${config.repoName}`
              : config.owner || "",
          )}/repository/files/${encodeURIComponent(
            file.oldPath,
          )}?ref=${config.branch}`,
          {
            headers: {
              Authorization: `Bearer ${
                config.currentLoginUserToken || config.token
              }`,
            },
          },
        );

        if (!response.ok) {
          throw new Error(`Failed to fetch ${file.oldPath} from GitLab`);
        }

        const data = await response.json();
        return {
          path: file.newPath,
          content: data.content,
          encoding: "base64",
        };
      } else {
        // GitHub
        // For media files request raw bytes and encode to base64 to avoid newline
        // or encoding inconsistencies from the Contents API JSON response.
        if (isMedia) {
          const response = await fetch(
            `https://api.github.com/repos/${config.owner}/${config.repoName}/contents/${file.oldPath}?ref=${config.branch}`,
            {
              headers: {
                Authorization: `token ${
                  config.currentLoginUserToken || config.token
                }`,
                Accept: "application/vnd.github.raw+json",
                "X-GitHub-Api-Version": GITHUB_API_VERSION,
              },
            },
          );

          if (!response.ok) {
            throw new Error(`Failed to fetch ${file.oldPath}`);
          }

          const buffer = await response.arrayBuffer();

          const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
            const bytes = new Uint8Array(buffer);
            let binary = "";
            const chunkSize = 0x8000;
            for (let i = 0; i < bytes.length; i += chunkSize) {
              // convert chunk to string
              binary += String.fromCharCode.apply(
                null,
                Array.from(bytes.subarray(i, i + chunkSize)),
              );
            }
            try {
              // browser btoa
              // @ts-ignore
              if (typeof btoa === "function") return btoa(binary);
            } catch (e) {}
            // node fallback
            return Buffer.from(binary, "binary").toString("base64");
          };

          const base64 = arrayBufferToBase64(buffer);

          return {
            path: file.newPath,
            content: base64,
            encoding: "base64",
          };
        } else {
          const response = await fetch(
            `https://api.github.com/repos/${config.owner}/${config.repoName}/contents/${file.oldPath}?ref=${config.branch}`,
            {
              headers: {
                Authorization: `token ${
                  config.currentLoginUserToken || config.token
                }`,
                Accept: "application/vnd.github.raw+json",
                "X-GitHub-Api-Version": GITHUB_API_VERSION,
              },
            },
          );

          if (!response.ok) {
            throw new Error(`Failed to fetch ${file.oldPath}`);
          }

          const content = await response.text();
          return {
            path: file.newPath,
            content,
          };
        }
      }
    } catch (error) {
      console.error(`Error fetching ${file.oldPath}:`, error);
      return null;
    }
  };

  const getFilesToMove = (
    currentPath: string,
    newPath: string,
  ): { oldPath: string; newPath: string }[] => {
    const normalizedFolderPath = currentPath.replace(/\/$/, "");
    const prefix = `${normalizedFolderPath}/`;

    return repoFiles
      .filter((item) => {
        if (!item.path) return false;
        // Check if item is within the folder
        return item.path.startsWith(prefix);
      })
      .map((item) => {
        const relativePath = item.path!.substring(
          normalizedFolderPath.length + 1,
        );
        return {
          oldPath: item.path!,
          newPath: `${newPath}/${relativePath}`,
        };
      });
  };

  const deleteFolder = async (
    folderPath: string,
    options?: {
      onSuccess?: () => void;
      logType?: EProjectLogType;
      logPathPrefix?: string;
    },
  ) => {
    if (!config.owner || !config.repoName || !config.branch) {
      toast.error(tFeedback("missing_context"));
      return;
    }

    if (!folderPath) {
      toast.error(tFeedback("invalid_path"));
      return;
    }

    const normalizedFolderPath = folderPath.replace(/\/$/, "");
    const prefix = `${normalizedFolderPath}/`;

    // Identify files to delete
    // Note: Some implementations filter by type==='blob', others don't.
    // The safest is to include everything that starts with the path.
    const matchingFiles = repoFiles
      .filter((item) => item.path && item.path.startsWith(prefix))
      .map((item) => item.path!);

    // Include the folder itself so Git removes the tree entry when empty (mostly for empty folders if they were tracked, though git doesn't track empty folders usually)
    const deleteTargets = Array.from(
      new Set([normalizedFolderPath, ...matchingFiles]),
    );

    if (!deleteTargets.length) {
      toast.error(tFeedback("unable_to_locate"));
      return;
    }

    try {
      const payload = {
        files: deleteTargets.map((path) => ({ path, delete: true })),
        message: `Delete folder: ${folderPath}`,
      };

      if (isGitLabProvider(config.provider)) {
        await updateGitLabFiles({
          id: config.repoName
            ? `${config.owner}/${config.repoName}`
            : config.owner,
          branch: config.branch,
          ...payload,
        }).unwrap();
      } else {
        await updateGitHubFiles({
          owner: config.owner,
          repo: config.repoName,
          tree: config.branch,
          ...payload,
        }).unwrap();
      }

      addLog({
        project_id: projectId,
        action: EAction.DELETE,
        file: options?.logPathPrefix
          ? `${options.logPathPrefix}${folderPath}`
          : folderPath,
        file_type: options?.logType || EProjectLogType.MEDIA,
        user_id: userId,
      });

      toast.success(tFeedback("folder_delete_success"));
      options?.onSuccess?.();
    } catch (error: any) {
      toast.error(
        error?.data?.message ||
          error?.message ||
          tFeedback("folder_delete_failed"),
      );
    }
  };

  const renameFolder = async (
    currentPath: string,
    newName: string,
    options?: {
      onSuccess?: () => void;
      logType?: EProjectLogType;
      logPathPrefix?: string;
    },
  ) => {
    if (!config.owner || !config.repoName || !config.branch) {
      toast.error(tFeedback("missing_context"));
      return;
    }

    if (!currentPath) {
      toast.error(tFeedback("invalid_path"));
      return;
    }

    const normalizedFolderPath = currentPath.replace(/\/$/, "");
    const parentPath = normalizedFolderPath.split("/").slice(0, -1).join("/");
    const newFolderPath = parentPath ? `${parentPath}/${newName}` : newName;

    const filesToMove = getFilesToMove(currentPath, newFolderPath);

    if (!filesToMove.length) {
      toast.error(tFeedback("unable_to_locate"));
      return;
    }

    try {
      const filesToDelete = filesToMove.map((file) => ({
        path: file.oldPath,
        delete: true,
      }));

      const fileContents = await Promise.all(
        filesToMove.map((file) => fetchFileContent(file)),
      );

      const validContents = fileContents.filter(
        (f): f is { path: string; content: string; encoding?: string } =>
          f !== null,
      );

      if (validContents.length !== filesToMove.length) {
        toast.error(tFeedback("fetch_failed"));
        return;
      }

      const payload = {
        files: [...filesToDelete, ...validContents],
        message: `Rename folder ${currentPath} to ${newName}`,
      };

      if (isGitLabProvider(config.provider)) {
        await updateGitLabFiles({
          id: config.repoName
            ? `${config.owner}/${config.repoName}`
            : config.owner,
          branch: config.branch,
          ...payload,
        }).unwrap();
      } else {
        await updateGitHubFiles({
          owner: config.owner,
          repo: config.repoName,
          tree: config.branch,
          ...payload,
        }).unwrap();
      }

      addLog({
        project_id: projectId,
        action: EAction.RENAME,
        file: options?.logPathPrefix
          ? `${options.logPathPrefix}${newFolderPath}`
          : newFolderPath,

        file_type: options?.logType || EProjectLogType.MEDIA,
        user_id: userId,
      });

      toast.success(tFeedback("folder_rename_success"));
      options?.onSuccess?.();
    } catch (error: any) {
      toast.error(
        error?.data?.message ||
          error?.message ||
          tFeedback("folder_rename_failed"),
      );
    }
  };

  const duplicateFolder = async (
    currentPath: string,
    newName: string,
    options?: {
      onSuccess?: () => void;
      logType?: EProjectLogType;
      logPathPrefix?: string;
    },
  ) => {
    if (!config.owner || !config.repoName || !config.branch) {
      toast.error(tFeedback("missing_context"));
      return;
    }

    const normalizedFolderPath = currentPath.replace(/\/$/, "");
    const parentPath = normalizedFolderPath.includes("/")
      ? normalizedFolderPath.split("/").slice(0, -1).join("/")
      : "";
    const newFolderPath = parentPath ? `${parentPath}/${newName}` : newName;

    const filesToCopy = getFilesToMove(currentPath, newFolderPath);

    if (!filesToCopy.length) {
      toast.error(tFeedback("unable_to_locate"));
      return;
    }

    try {
      const fileContents = await Promise.all(
        filesToCopy.map((file) => fetchFileContent(file)),
      );

      const validContents = fileContents.filter(
        (f): f is { path: string; content: string; encoding?: string } =>
          f !== null,
      );

      if (validContents.length !== filesToCopy.length) {
        toast.error(tFeedback("fetch_failed"));
        return;
      }

      const payload = {
        files: validContents,
        message: `Duplicate folder ${currentPath} to ${newName}`,
      };

      if (isGitLabProvider(config.provider)) {
        await updateGitLabFiles({
          id: config.repoName
            ? `${config.owner}/${config.repoName}`
            : config.owner,
          branch: config.branch,
          ...payload,
        }).unwrap();
      } else {
        await updateGitHubFiles({
          owner: config.owner,
          repo: config.repoName,
          tree: config.branch,
          ...payload,
        }).unwrap();
      }

      addLog({
        project_id: projectId,
        action: EAction.CREATE,
        file: options?.logPathPrefix
          ? `${options.logPathPrefix}${newFolderPath}`
          : newFolderPath,

        file_type: options?.logType || EProjectLogType.MEDIA,
        user_id: userId,
      });

      toast.success(tFeedback("folder_duplicate_success"));
      options?.onSuccess?.();
    } catch (error: any) {
      toast.error(
        error?.data?.message ||
          error?.message ||
          tFeedback("folder_duplicate_failed"),
      );
    }
  };

  return {
    deleteFolder,
    renameFolder,
    duplicateFolder,
    isLoading,
  };
}
