"use client";

import { commitStatusState } from "@/redux/features/git/provider-adapter";
import { useGitProvider } from "@/hooks/use-git-provider";
import { TGitProvider } from "@/lib/utils/provider-checker";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useDeploymentStatusPollingInterval } from "@/hooks/use-deployment-status-polling";
import { useFeatureAccess } from "@/hooks/use-feature-access";
import { selectConfig } from "@/redux/features/config/slice";
import { TGitCommit } from "@/redux/features/git/provider-args";
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

  const { hasAdvancedFeatures } = useFeatureAccess();

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
          {commits?.map((commit: TGitCommit, index: number) => {
            const isLatest = index === 0 && page === 1;
            const sha = adapter.commitRef(commit);

            return (
              <CommitWrapper
                key={sha}
                provider={adapter.id === "gitlab" ? "Gitlab" : "Github"}
                commit={commit}
                onSuccess={handleSuccess}
                isLatest={isLatest}
                hasAdvancedFeatures={hasAdvancedFeatures}
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
    </Card>
  );
}

function CommitWrapper({
  provider,
  commit,
  onSuccess,
  isLatest,
  hasAdvancedFeatures,
}: {
  provider: TGitProvider;
  commit: TGitCommit;
  onSuccess?: () => void;
  isLatest: boolean;
  hasAdvancedFeatures: boolean;
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
    skip: !hasAdvancedFeatures,
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
      onSuccess={onSuccess}
      isLatest={isLatest}
      deploymentStatus={statusStateFromData}
    />
  );
}
