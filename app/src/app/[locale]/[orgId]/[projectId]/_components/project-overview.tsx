"use client";

import { useGitProvider } from "@/hooks/use-git-provider";
import { commitStatusState } from "@/redux/features/git/provider-adapter";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { useDeploymentStatusPollingInterval } from "@/hooks/use-deployment-status-polling";
import { useOwnerPlan } from "@/hooks/use-owner-plan";
import {
  getDeploymentStatusI18nKey,
  getDeploymentStatusVariant,
  isDisplayableDeploymentStatus,
} from "@/lib/utils/deployment-status";
import { isGitLabProvider } from "@/lib/utils/provider-checker";
import { SiGithub, SiGitlab } from "@icons-pack/react-simple-icons";
import { formatDistanceToNow } from "date-fns";
import { ExternalLink, Loader2, PencilLine } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { BranchSwitcher } from "./branch-switcher";
import { ProjectThumb } from "./project-thumb";

export default function ProjectOverview({
  project,
  config,
  projectLogQuery,
}: {
  project: any;
  config: any;
  projectLogQuery: any;
}) {
  const tDashboard = useTranslations("dashboard");
  const tCommon = useTranslations("common");
  const tEditorHeader = useTranslations("editor.header");

  const params = useParams();
  const logs = projectLogQuery?.data?.logs ?? [];
  const lastLog = logs.length > 0 ? logs[0] : null;
  const { canAccessProFeatures } = useOwnerPlan();
  const provider = config?.provider || project?.provider;
  const isGitLab = isGitLabProvider(provider);

  const [statusState, setStatusState] = useState<string | undefined>(undefined);
  const pollingInterval = useDeploymentStatusPollingInterval(statusState);

  const { adapter, useGitCommits, useGitCommitStatus } = useGitProvider();

  const { data: commits } = useGitCommits({
    page: 1,
    perPage: 4,
    skip: !config.owner || !config.branch || !config.token,
  });

  const latestCommit = commits?.[0] ?? null;
  const latestCommitRef = adapter.commitRef(latestCommit);

  const { data: rawStatus, isLoading: isStatusLoading } = useGitCommitStatus({
    commitRef: latestCommitRef,
    skip: !latestCommitRef || !canAccessProFeatures,
    pollingInterval,
  });
  const statusStateFromData = commitStatusState(rawStatus);

  // The polling interval feeds the status query's options, so the query result
  // cannot be passed straight to the interval hook. Mirroring it during render
  // breaks that cycle without the extra commit an effect would cause.
  if (statusState !== statusStateFromData) {
    setStatusState(statusStateFromData);
  }

  const buildStatus = statusStateFromData;
  const latestCommitDate = adapter.commitDate(latestCommit);
  const latestCommitAuthor = adapter.commitAuthor(latestCommit);

  const lastUpdated = latestCommitDate
    ? formatDistanceToNow(new Date(latestCommitDate), { addSuffix: false })
    : lastLog?.createdAt
      ? formatDistanceToNow(new Date(lastLog.createdAt), { addSuffix: false })
      : tDashboard("recently");

  const lastAuthor =
    latestCommitAuthor || lastLog?.user_name || tCommon("system");

  const siteUrl = project?.site_url;

  const cleanUrl = siteUrl ? siteUrl.replace(/^https?:\/\//, "") : "";

  return (
    <div className="border-border bg-card text-card-foreground grid grid-cols-1 rounded-lg border md:grid-cols-12">
      {/* Left Column: Preview */}
      <div className="group relative flex items-center justify-center p-6 md:col-span-7 lg:col-span-6">
        <ProjectThumb project={project} />
      </div>

      {/* Right Column: Details */}
      <div className="flex flex-col justify-start px-6 pb-6 md:col-span-5 md:px-0 md:pt-6 lg:col-span-6">
        <ul className="space-y-4">
          {/* Deployment */}
          <li>
            <div className="flex gap-2">
              <Label className="text-muted-foreground block">
                {tDashboard("website")}
              </Label>
              <Link
                href={`/${params.orgId}/${params.projectId}/settings/general`}
                className="text-muted-foreground hover:text-foreground transition-colors"
                title={tDashboard("edit_website")}
              >
                <PencilLine className="size-3.5" />
              </Link>
            </div>
            <div className="mt-1">
              {siteUrl ? (
                <a
                  href={
                    siteUrl.startsWith("http") ? siteUrl : `https://${siteUrl}`
                  }
                  target="_blank"
                  rel="noreferrer"
                  className="text-foreground hover:text-primary flex flex-wrap items-center gap-2 font-medium transition-colors hover:underline hover:underline-offset-4"
                >
                  {cleanUrl}
                  <ExternalLink className="size-3 opacity-50" />
                </a>
              ) : (
                <p className="text-muted-foreground text-sm">—</p>
              )}
            </div>
          </li>

          {/* build status */}
          <li>
            <Label className="text-muted-foreground block">
              {tDashboard("build_status")}
            </Label>
            <div className="mt-1">
              {canAccessProFeatures && isStatusLoading ? (
                <Loader2 className="size-4 animate-spin opacity-50" />
              ) : canAccessProFeatures &&
                isDisplayableDeploymentStatus(buildStatus) ? (
                <Badge
                  variant={getDeploymentStatusVariant(buildStatus)}
                  className="capitalize"
                >
                  {tEditorHeader(getDeploymentStatusI18nKey(buildStatus))}
                </Badge>
              ) : (
                <p className="text-muted-foreground text-sm">—</p>
              )}
            </div>
          </li>

          {/* last update */}
          <li>
            <Label className="text-muted-foreground block">
              {tDashboard("last_updated")}
            </Label>
            <div className="mt-1">
              <a
                href={
                  isGitLab
                    ? `https://gitlab.com/${project?.repository}/-/commits/${config.branch}`
                    : `https://github.com/${config.owner}/${config.repoName}/commits/${config.branch}`
                }
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground hover:text-primary transition-colors hover:underline hover:underline-offset-4"
              >
                {tDashboard("last_updated_by", {
                  distance: lastUpdated,
                  author: lastAuthor,
                })}
              </a>
            </div>
          </li>

          {/* git source and branch */}
          <li>
            <Label className="text-muted-foreground block">
              {tDashboard("source")}
            </Label>
            <div className="flex items-center gap-2">
              {isGitLab ? (
                <SiGitlab className="size-5" />
              ) : (
                <SiGithub className="size-5" />
              )}

              <BranchSwitcher project={project} config={config} />
            </div>
          </li>
        </ul>
      </div>
    </div>
  );
}
