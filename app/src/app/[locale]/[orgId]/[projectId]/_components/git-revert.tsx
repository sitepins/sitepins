"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { isGitLabProvider } from "@/lib/utils/provider-checker";
import { selectConfig } from "@/redux/features/config/slice";
import {
  githubApi,
  useRevertGitHubCommitMutation,
  useRevertToGitHubCommitMutation,
} from "@/redux/features/github";
import {
  gitlabApi,
  useRevertToGitLabCommitMutation,
} from "@/redux/features/gitlab";
import { AlertCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useDispatch, useSelector } from "react-redux";
import { toast } from "sonner";

interface RevertConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  provider: "Github" | "Gitlab" | string;
  commit: any;
  title: string;
  description: string;
  warningText: string;
  type: "reset" | "revert";
}

export function RevertConfirmDialog({
  isOpen,
  onClose,
  onSuccess,
  provider,
  commit,
  title,
  description,
  warningText,
  type,
}: RevertConfirmDialogProps) {
  const dispatch = useDispatch();
  const tCommon = useTranslations("common");
  const tGit = useTranslations("project.git");
  const { owner, repoName, token, branch } = useSelector(selectConfig);

  const [revertToGitHub, { isLoading: isRevertingToGitHub }] =
    useRevertToGitHubCommitMutation();
  const [revertGitHub, { isLoading: isRevertingGitHub }] =
    useRevertGitHubCommitMutation();
  const [revertToGitLab, { isLoading: isRevertingToGitLab }] =
    useRevertToGitLabCommitMutation();

  const isLoading =
    isRevertingToGitHub || isRevertingGitHub || isRevertingToGitLab;

  const handleConfirm = async () => {
    if (!owner || !repoName || !branch || !token) {
      toast.error(tCommon("errors.missing_git_info"));
      return;
    }

    try {
      let sha = "";
      if (isGitLabProvider(provider)) {
        if (type === "reset") {
          const result = await revertToGitLab({
            projectId: `${owner}/${repoName}`,
            sha: commit.id,
            branch,
            token,
          }).unwrap();
          sha = result.sha;
          toast.success(
            tGit("feedback.reset_success", {
              sha: String(sha).substring(0, 7),
            }),
          );
        }
      } else {
        if (type === "reset") {
          const result = await revertToGitHub({
            owner,
            repo: repoName,
            sha: commit.sha,
            branch,
            token,
          }).unwrap();
          sha = result.sha;
          toast.success(
            tGit("feedback.reset_success", {
              sha: String(sha).substring(0, 7),
            }),
          );
        } else {
          const result = await revertGitHub({
            owner,
            repo: repoName,
            sha: commit.sha,
            branch,
            token,
          }).unwrap();
          sha = result.sha;
          toast.success(
            tGit("feedback.revert_success", {
              sha: String(sha).substring(0, 7),
            }),
          );
        }
      }

      // Invalidate tags to refresh commit history without page reload
      if (isGitLabProvider(provider)) {
        dispatch(
          gitlabApi.util.invalidateTags([{ type: "GitLabCommit", id: "LIST" }]),
        );
      } else {
        dispatch(
          githubApi.util.invalidateTags([{ type: "GitHubCommit", id: "LIST" }]),
        );
      }

      if (onSuccess) {
        onSuccess();
      }

      onClose();
    } catch (err: any) {
      const msg =
        err?.data?.message || err?.message || tGit("feedback.revert_failed");
      toast.error(msg);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="text-destructive h-5 w-5" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="bg-destructive/10 border-destructive/20 rounded-lg border p-3">
          <p className="text-destructive text-sm">{warningText}</p>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            {tCommon("actions.cancel")}
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            isLoading={isLoading}
            disabled={isLoading}
          >
            {isLoading
              ? type === "reset"
                ? tGit("actions.restoring")
                : tGit("actions.undoing")
              : type === "reset"
                ? tGit("actions.confirm_restore")
                : tGit("actions.confirm_undo")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
