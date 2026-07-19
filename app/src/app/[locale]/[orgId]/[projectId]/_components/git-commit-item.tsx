"use client";

import Avatar from "@/components/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useOwnerPlan } from "@/hooks/use-owner-plan";
import { usePermission } from "@/hooks/use-permission";
import { ENUM_PERMISSIONS } from "@/lib/roles";
import {
  getDeploymentStatusVariant,
  isDisplayableDeploymentStatus,
} from "@/lib/utils/deployment-status";
import { isGitHubProvider } from "@/lib/utils/provider-checker";
import { formatDistanceToNow } from "date-fns";
import { Clock, History, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { RevertConfirmDialog } from "./git-revert";

interface CommitItemProps {
  provider: "Github" | "Gitlab";
  commit: any;
  setShowUpgradeDialog: (show: boolean) => void;
  onSuccess?: () => void;
  isLatest?: boolean;
  deploymentStatus?: string | null;
}

export function GitCommitItem({
  provider,
  commit,
  setShowUpgradeDialog,
  onSuccess,
  isLatest,
  deploymentStatus,
}: CommitItemProps) {
  const tProjectGit = useTranslations("project.git");
  const { canAccessPremiumFeatures } = useOwnerPlan();
  const canRestore = usePermission(ENUM_PERMISSIONS.MANAGE_PROJECTS);

  const [revertDialog, setRevertDialog] = useState<"reset" | "revert" | null>(
    null,
  );

  const handleActionClick = (type: "reset" | "revert") => {
    if (!canAccessPremiumFeatures) {
      setShowUpgradeDialog(true);
      return;
    }

    if (type === "reset" && !canRestore) {
      toast.error(tProjectGit("admin_only"));
      return;
    }

    setRevertDialog(type);
  };

  // Extract display data based on provider
  const isGitHub = isGitHubProvider(provider);
  const authorName = isGitHub
    ? commit.commit?.author?.name
    : commit.author_name;
  const authorEmail = isGitHub ? commit.author?.email : commit.author_email;
  const avatarUrl = isGitHub ? commit.author?.avatar_url : "";
  const commitMessage = isGitHub ? commit.commit.message : commit.title;
  const commitUrl = isGitHub ? commit.html_url : commit.web_url;
  const commitDate = isGitHub
    ? commit.commit?.author?.date
    : commit.committed_date;

  return (
    <>
      <div className="border-b-border hover:bg-muted/50 relative flex space-x-3 border-b p-4 transition-colors">
        <Avatar
          email={authorEmail!}
          src={avatarUrl!}
          alt=""
          width={40}
          height={40}
          className="mt-1 hidden size-8! rounded-full sm:flex"
        />
        <div className="min-w-0 flex-1">
          <p className="text-text-dark truncate text-sm font-medium">
            {authorName}
          </p>
          <a
            href={commitUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground mt-2 block truncate text-sm hover:underline"
          >
            {commitMessage}
          </a>
          <div className="text-muted-foreground mt-2 flex items-center space-x-3 text-sm">
            <div className="flex items-center space-x-1">
              <Clock className="h-4 w-4" />
              <span>
                {commitDate
                  ? formatDistanceToNow(new Date(commitDate), {
                      addSuffix: true,
                    })
                  : ""}
              </span>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {canRestore && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleActionClick("reset")}
                disabled={isLatest}
                className="h-8 w-full sm:w-auto"
              >
                <History className="mr-1 h-3 w-3" />
                {tProjectGit("restore_version")}
              </Button>
            )}
            {isGitHub && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleActionClick("revert")}
                className="h-8 w-full sm:w-auto"
              >
                <RotateCcw className="mr-1 h-3 w-3" />
                {tProjectGit("undo_commit")}
              </Button>
            )}
          </div>
        </div>
        {isDisplayableDeploymentStatus(deploymentStatus) && (
          <Badge
            variant={getDeploymentStatusVariant(deploymentStatus)}
            className="absolute top-4 right-4 capitalize"
          >
            {deploymentStatus}
          </Badge>
        )}
      </div>

      <RevertConfirmDialog
        isOpen={revertDialog === "reset"}
        onClose={() => setRevertDialog(null)}
        onSuccess={onSuccess}
        provider={provider}
        commit={commit}
        type="reset"
        title={tProjectGit("restore_title")}
        description={
          isGitHub
            ? tProjectGit("restore_description_github")
            : tProjectGit("restore_description_gitlab")
        }
        warningText={
          isGitHub
            ? tProjectGit("restore_warning_github")
            : tProjectGit("restore_warning_gitlab")
        }
      />
      {isGitHub && (
        <RevertConfirmDialog
          isOpen={revertDialog === "revert"}
          onClose={() => setRevertDialog(null)}
          onSuccess={onSuccess}
          provider="Github"
          commit={commit}
          type="revert"
          title={tProjectGit("undo_title")}
          description={tProjectGit("undo_description")}
          warningText={tProjectGit("undo_warning")}
        />
      )}
    </>
  );
}
