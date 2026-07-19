"use client";

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
import {
  isGitHubProvider,
  isGitLabProvider,
} from "@/lib/utils/provider-checker";
import { selectConfig } from "@/redux/features/config/slice";
import {
  useGetGitHubCommitsQuery,
  useGetGitHubCommitStatusQuery,
} from "@/redux/features/github";
import {
  useGetGitLabCommitsQuery,
  useGetGitLabCommitStatusQuery,
} from "@/redux/features/gitlab";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { GitCommitItem } from "./git-commit-item";

export default function GitActivity() {
  const tProjectGit = useTranslations("project.git");
  const tActivity = useTranslations("project.activity");
  const { branch, owner, repoName, token, provider } =
    useSelector(selectConfig);
  const ref = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(1);
  const [lastCommitNumber, setLastCommitNumber] = useState<number | null>(null);
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);

  const { canAccessPremiumFeatures } = useOwnerPlan();

  const isGitHub = isGitHubProvider(provider);
  const isGitLab = isGitLabProvider(provider);

  const {
    data: ghCommits,
    isLoading: ghLoading,
    refetch: ghRefetch,
  } = useGetGitHubCommitsQuery(
    { owner, repo: repoName, page, per_page: 4, sha: branch },
    {
      skip: !isGitHub || !owner || !repoName || !branch || !token,
      refetchOnMountOrArgChange: true,
    },
  );

  const {
    data: glCommits,
    isLoading: glLoading,
    refetch: glRefetch,
  } = useGetGitLabCommitsQuery(
    { id: `${owner}/${repoName}`, ref: branch, page, per_page: 4 },
    {
      skip: !isGitLab || !repoName || !branch || !token,
      refetchOnMountOrArgChange: true,
    },
  );

  const commits = isGitLab ? glCommits : ghCommits;
  const isLoading = isGitLab ? glLoading : ghLoading;

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
      if (isGitHub) ghRefetch();
      if (isGitLab) glRefetch();
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
            const sha = isGitHub ? commit.sha : commit.id;

            return (
              <CommitWrapper
                key={sha}
                provider={isGitLab ? "Gitlab" : "Github"}
                commit={commit}
                setShowUpgradeDialog={setShowUpgradeDialog}
                onSuccess={handleSuccess}
                isLatest={isLatest}
                canAccessPremiumFeatures={canAccessPremiumFeatures}
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
  canAccessPremiumFeatures,
  owner,
  repoName,
  branch,
}: {
  provider: "Github" | "Gitlab";
  commit: any;
  setShowUpgradeDialog: (show: boolean) => void;
  onSuccess?: () => void;
  isLatest: boolean;
  canAccessPremiumFeatures: boolean;
  owner: string;
  repoName: string;
  branch: string;
}) {
  const isGitHub = isGitHubProvider(provider);
  const isGitLab = isGitLabProvider(provider);

  // State-based status tracking (not refs) so that useDeploymentStatusPollingInterval
  // receives the correct value on the same render after a tag-invalidation refetch.
  const [ghStatusState, setGhStatusState] = useState<string | undefined>(
    undefined,
  );
  const [glStatusState, setGlStatusState] = useState<string | undefined>(
    undefined,
  );

  const ghPollingInterval = useDeploymentStatusPollingInterval(ghStatusState);
  const glPollingInterval = useDeploymentStatusPollingInterval(glStatusState);

  const { data: ghStatus } = useGetGitHubCommitStatusQuery(
    { owner, repo: repoName, ref: commit.sha },
    {
      skip: !isGitHub || !canAccessPremiumFeatures,
      pollingInterval: ghPollingInterval,
    },
  );
  const ghStatusStateFromData =
    typeof ghStatus === "object" && ghStatus !== null
      ? (ghStatus as any).state
      : ghStatus;

  const { data: glStatus } = useGetGitLabCommitStatusQuery(
    { id: `${owner}/${repoName}`, sha: commit.id, ref: branch },
    {
      skip: !isGitLab || !canAccessPremiumFeatures,
      pollingInterval: glPollingInterval,
    },
  );
  const glStatusStateFromData =
    typeof glStatus === "object" && glStatus !== null
      ? (glStatus as any).state
      : glStatus;

  // Sync RTK Query data into state so the polling hook re-evaluates on status changes.
  useEffect(() => {
    setGhStatusState(ghStatusStateFromData);
  }, [ghStatusStateFromData]);

  useEffect(() => {
    setGlStatusState(glStatusStateFromData);
  }, [glStatusStateFromData]);

  const status = isGitHub ? ghStatusStateFromData : glStatusStateFromData;

  return (
    <GitCommitItem
      provider={provider}
      commit={commit}
      setShowUpgradeDialog={setShowUpgradeDialog}
      onSuccess={onSuccess}
      isLatest={isLatest}
      deploymentStatus={status}
    />
  );
}
