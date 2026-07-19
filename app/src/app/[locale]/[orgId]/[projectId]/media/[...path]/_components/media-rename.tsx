"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GITHUB_API_VERSION, GITLAB_API_VERSION } from "@/lib/constant";
import { checkMedia } from "@/lib/utils/check-media-file";
import { toBase64 } from "@/lib/utils/git-utils";
import { isGitLabProvider } from "@/lib/utils/provider-checker";
import { selectConfig } from "@/redux/features/config/slice";
import {
  githubContentApi,
  useUpdateGitHubFilesMutation,
} from "@/redux/features/github";
import {
  gitlabContentApi,
  useUpdateGitLabFilesMutation,
} from "@/redux/features/gitlab";
import { selectMediaInfo, setMedia } from "@/redux/features/media/slice";
import { useAppDispatch } from "@/redux/store";
import { TFiles } from "@/types";
import { useTranslations } from "next-intl";
import path from "path";
import { useState } from "react";
import { useSelector } from "react-redux";
import { toast } from "sonner";

export default function MediaRename({
  filePath,
  children,
  open,
  setOpen,
}: {
  filePath: string;
  children?: React.ReactNode;
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  // const [open, setOpen] = useState(false);
  const ext = path.extname(filePath);
  const baseName = path.basename(filePath, ext);
  const [newNameWithoutExt, setNewNameWithoutExt] = useState(baseName);

  const newName = `${newNameWithoutExt}${ext}`;

  const dispatch = useAppDispatch();
  const config = useSelector(selectConfig);
  const tMedia = useTranslations("media");
  const tCommon = useTranslations("common");
  const { media: medias } = useSelector(selectMediaInfo);
  const [renameFile, { isLoading: isGhLoading }] =
    useUpdateGitHubFilesMutation();
  const [renameGitLabFile, { isLoading: isGlLoading }] =
    useUpdateGitLabFilesMutation();

  const isLoading = isGitLabProvider(config.provider)
    ? isGlLoading
    : isGhLoading;

  const handleRename = async () => {
    if (!newNameWithoutExt || newName === path.basename(filePath)) {
      setOpen(false);
      return;
    }

    const dir = path.dirname(filePath);
    const newPath = path.join(dir, newName);

    try {
      // Fetch file content properly based on file type
      const isMedia = checkMedia(filePath);
      let content: string;

      if (isGitLabProvider(config.provider)) {
        // GitLab API always returns base64 encoded content
        const response = await fetch(
          `https://gitlab.com/api/${GITLAB_API_VERSION}/projects/${encodeURIComponent(config.repoName ? `${config.owner}/${config.repoName}` : config.owner)}/repository/files/${encodeURIComponent(filePath)}?ref=${config.branch}`,
          {
            headers: {
              Authorization: `Bearer ${config.currentLoginUserToken || config.token}`,
            },
          },
        );

        if (!response.ok) {
          throw new Error(`Failed to fetch ${filePath} from GitLab`);
        }

        const data = await response.json();
        // GitLab API returns base64 encoded content - use as-is
        content = data.content;
      } else {
        // GitHub
        if (isMedia) {
          // For media files, get base64 content from GitHub API
          const response = await fetch(
            `https://api.github.com/repos/${config.owner}/${config.repoName}/contents/${filePath}?ref=${config.branch}`,
            {
              headers: {
                Authorization: `token ${config.currentLoginUserToken || config.token}`,
                Accept: "application/vnd.github+json",
                "X-GitHub-Api-Version": GITHUB_API_VERSION,
              },
            },
          );

          if (!response.ok) {
            throw new Error(`Failed to fetch ${filePath}`);
          }

          const data = await response.json();
          // GitHub API returns base64 encoded content for binary files
          content = data.content.replace(/\n/g, ""); // Remove newlines from base64
        } else {
          // For text files, get raw content and convert to base64
          const response = await fetch(
            `https://api.github.com/repos/${config.owner}/${config.repoName}/contents/${filePath}?ref=${config.branch}`,
            {
              headers: {
                Authorization: `token ${config.currentLoginUserToken || config.token}`,
                Accept: "application/vnd.github.raw+json",
                "X-GitHub-Api-Version": GITHUB_API_VERSION,
              },
            },
          );

          if (!response.ok) {
            throw new Error(`Failed to fetch ${filePath}`);
          }

          const rawText = await response.text();
          // Convert text content to base64 for the mutation
          content = toBase64(rawText);
        }
      }

      if (isGitLabProvider(config.provider)) {
        await renameGitLabFile({
          id: config.repoName
            ? `${config.owner}/${config.repoName}`
            : config.owner,
          branch: config.branch,
          message: `Rename ${path.basename(filePath)} to ${newName}`,
          files: [
            {
              path: filePath,
              delete: true,
            },
            {
              path: newPath,
              content: content,
            },
          ],
        }).unwrap();
      } else {
        await renameFile({
          owner: config.owner,
          repo: config.repoName,
          message: `Rename ${path.basename(filePath)} to ${newName}`,
          tree: config.branch,
          files: [
            {
              path: filePath,
              delete: true,
            },
            {
              path: newPath,
              content: content,
            },
          ],
        }).unwrap();
      }

      // Update local media state to reflect change immediately if needed,
      // though usually a re-fetch or invalidation handles this.
      // But we can remove the old one from state to avoid issues.
      const fullOldPath = filePath.startsWith("media/")
        ? filePath
        : `media/${filePath}`;
      const fullNewPath = newPath.startsWith("media/")
        ? newPath
        : `media/${newPath}`;

      const newMediaList = medias.map((item) => {
        if (item.path === fullOldPath) {
          return { ...item, path: fullNewPath, name: newName };
        }
        return item;
      });
      dispatch(setMedia(newMediaList));

      if (isGitLabProvider(config.provider)) {
        dispatch(
          gitlabContentApi.util.updateQueryData(
            "getGitLabTrees",
            {
              id: config.repoName
                ? `${config.owner}/${config.repoName}`
                : config.owner,
              ref: config.branch,
              recursive: true,
              config: config,
            },
            (draft: any) => {
              const files = draft.files as (TFiles & {
                commitDate: string;
              })[];
              const foundIndex = files.findIndex(
                (file) => file.path === fullOldPath,
              );

              if (foundIndex !== -1) {
                files[foundIndex].name = newName;
                files[foundIndex].path = fullNewPath;
                files[foundIndex].commitDate = new Date().toISOString();
              }
            },
          ),
        );
      } else {
        dispatch(
          githubContentApi.util.updateQueryData(
            "getGitHubTrees",
            {
              owner: config.owner,
              repo: config.repoName,
              tree_sha: config.branch,
              recursive: "1",
              config: config,
            },
            (draft: any) => {
              // Update trees
              const treeIndex = draft.trees.findIndex(
                (file: TFiles) => file.path === fullOldPath,
              );
              if (treeIndex !== -1) {
                draft.trees[treeIndex].name = newName;
                draft.trees[treeIndex].path = fullNewPath;
                draft.trees[treeIndex].commitDate = new Date().toISOString();
              }

              // Update files
              const fileIndex = draft.files.findIndex(
                (file: TFiles) => file.path === fullOldPath,
              );
              if (fileIndex !== -1) {
                draft.files[fileIndex].path = fullNewPath;
              }
            },
          ),
        );
      }

      toast.success(tMedia("rename_successful", { name: newName }));
      setOpen(false);
    } catch (error) {
      console.error("Rename error:", error);
      toast.error(tMedia("error_renaming"));
    }
  };

  return (
    <Dialog modal open={open} onOpenChange={setOpen}>
      {/* <DialogTrigger asChild>
        {children ? (
          children
        ) : (
          <Button className="w-full space-x-1" variant="outline">
            <FilePenLine className="size-4" />
            <span>Rename</span>
          </Button>
        )}
      </DialogTrigger> */}

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{tMedia("rename_file")}</DialogTitle>
          <DialogDescription>
            {tCommon("confirm.enter_new_name")}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <Label htmlFor="name" className="mb-2 block">
            {tCommon("labels.name")}
          </Label>
          <div className="flex items-center gap-2">
            <Input
              id="name"
              value={newNameWithoutExt}
              onChange={(e) => setNewNameWithoutExt(e.target.value)}
              className="col-span-3"
              placeholder="e.g. avatar"
            />
            {ext && (
              <span className="bg-muted text-muted-foreground shrink-0 rounded-md border px-3 py-2 text-sm">
                {ext}
              </span>
            )}
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" type="button">
              {tCommon("actions.cancel")}
            </Button>
          </DialogClose>
          <Button
            onClick={handleRename}
            isLoading={isLoading}
            disabled={!newNameWithoutExt || newName === path.basename(filePath)}
          >
            {tCommon("actions.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
