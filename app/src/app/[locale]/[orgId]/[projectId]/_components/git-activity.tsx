"use client";

import { commitStatusState } from "@/redux/features/git/provider-adapter";
import { useGitProvider } from "@/hooks/use-git-provider";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { UpgradeDialog } from "@/components/upgrade-dialog";
import { useDeploymentStatusPollingInterval } from "@/hooks/use-deployment-status-polling";
import { useOwnerPlan } from "@/hooks/use-owner-plan";
import { selectConfig } from "@/redux/features/config/slice";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { GitCommitItem } from "./git-commit-item";

export default function GitActivity() {
  const tProjectGit = useTranslations("project.git");
  const tActivity = useTranslations("project.activity");
  const { branch, owner, repoName, token } = useSelector(selectConfig);
  const ref = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(1);
  const [lastCommitNumber, setLastCommitNumber] = useState<number | null>(null);
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);

  const { canAccessProFeatures } = useOwnerPlan();

  const { adapter, useGitCommits } = useGitProvider();
  const {
    data: commits,
    isLoading,
    refetch,
  } = useGitCommits({
    page,
    perPage: 4,
    skip: !owner || !repoName || !branch || !token,
  });

  const handleLoadMore = () => {
    setPage((prev) => prev + 1);
    if (commits) {
      setLastCommitNumber(commits.length);
    }
  };

  const handleSuccess = () => {
    setPage(1);
    setLastCommitNumber(null);
    // Give the Git provider a moment to update their internal indices
    setTimeout(() => {
      refetch();
    }, 500);
  };

  useEffect(() => {
    if (ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight;
    }
  }, []);

  const commitLoading = (lastCommitNumber || 0) >= (commits?.length || 0);

  useEffect(() => {
    if (!commitLoading && lastCommitNumber !== null) {
      ref.current?.scrollTo({
        top: ref.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [commitLoading, lastCommitNumber]);

  return (
    <Card className="gap-0">
      <CardHeader className="border-border border-b">
        <CardTitle>{tProjectGit("recent_activities")}</CardTitle>
        <CardDescription>{tProjectGit("recent_commits")}</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div
          ref={ref}
          className="h-full overflow-x-hidden md:max-h-72.5 md:overflow-y-auto"
        >
          {commits?.map((commit: any, index: number) => {
            const isLatest = index === 0 && page === 1;
            const sha = adapter.commitRef(commit);

            return (
              <CommitWrapper
                key={sha}
                provider={adapter.id === "gitlab" ? "Gitlab" : "Github"}
                commit={commit}
                setShowUpgradeDialog={setShowUpgradeDialog}
                onSuccess={handleSuccess}
                isLatest={isLatest}
                canAccessProFeatures={canAccessProFeatures}
                owner={owner}
                repoName={repoName}
                branch={branch}
              />
            );
          })}
        </div>
      </CardContent>
      <CardFooter>
        <Button
          isLoading={commitLoading || isLoading}
          disabled={commitLoading || isLoading}
          className="border-border w-full border"
          onClick={handleLoadMore}
        >
          {tActivity("load_more")}
        </Button>
      </CardFooter>

      <UpgradeDialog
        open={showUpgradeDialog}
        onOpenChange={setShowUpgradeDialog}
        contextKey="git"
      />
    </Card>
  );
}

function CommitWrapper({
  provider,
  commit,
  setShowUpgradeDialog,
  onSuccess,
  isLatest,
  canAccessProFeatures,
}: {
  provider: "Github" | "Gitlab";
  commit: any;
  setShowUpgradeDialog: (show: boolean) => void;
  onSuccess?: () => void;
  isLatest: boolean;
  canAccessProFeatures: boolean;
  owner: string;
  repoName: string;
  branch: string;
}) {
  // State-based status tracking (not refs) so that useDeploymentStatusPollingInterval
  // receives the correct value on the same render after a tag-invalidation refetch.
  const [statusState, setStatusState] = useState<string | undefined>(undefined);

  const { adapter, useGitCommitStatus } = useGitProvider();
  const pollingInterval = useDeploymentStatusPollingInterval(statusState);

  const { data: rawStatus } = useGitCommitStatus({
    commitRef: adapter.commitRef(commit),
    skip: !canAccessProFeatures,
    pollingInterval,
  });
  const statusStateFromData = commitStatusState(rawStatus);

  // The polling interval feeds the status query's options, so the query result
  // cannot be passed straight to the interval hook. Mirroring it during render
  // breaks that cycle without the extra commit an effect would cause.
  if (statusState !== statusStateFromData) {
    setStatusState(statusStateFromData);
  }

  return (
    <GitCommitItem
      provider={provider}
      commit={commit}
      setShowUpgradeDialog={setShowUpgradeDialog}
      onSuccess={onSuccess}
      isLatest={isLatest}
      deploymentStatus={statusStateFromData}
    />
  );
}
