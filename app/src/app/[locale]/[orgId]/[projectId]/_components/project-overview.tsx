"use client";

import { fetchProjectPreviewImage } from "@/lib/project-preview-image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useDeploymentStatusPollingInterval } from "@/hooks/use-deployment-status-polling";
import { useOwnerPlan } from "@/hooks/use-owner-plan";
import {
  getDeploymentStatusI18nKey,
  getDeploymentStatusVariant,
  isDisplayableDeploymentStatus,
} from "@/lib/utils/deployment-status";
import {
  isGitHubProvider,
  isGitLabProvider,
} from "@/lib/utils/provider-checker";
import {
  useGetGitHubCommitStatusQuery,
  useGetGitHubCommitsQuery,
} from "@/redux/features/github";
import {
  useGetGitLabCommitStatusQuery,
  useGetGitLabCommitsQuery,
} from "@/redux/features/gitlab";
import { SiGithub, SiGitlab } from "@icons-pack/react-simple-icons";
import { formatDistanceToNow } from "date-fns";
import { ExternalLink, Loader2, PencilLine, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { BranchSwitcher } from "./branch-switcher";
import {
  getCachedScreenshot,
  setCachedScreenshot,
  clearOldLocalStoragePreviews,
} from "@/lib/utils/indexed-db";

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
  const [isImageLoading, setIsImageLoading] = useState(true);
  const [hasImageError, setHasImageError] = useState(false);
  const logs = projectLogQuery?.data?.logs ?? [];
  const lastLog = logs.length > 0 ? logs[0] : null;
  const { canAccessPremiumFeatures } = useOwnerPlan();
  const provider = config?.provider || project?.provider;
  const isGitHub = isGitHubProvider(provider);
  const isGitLab = isGitLabProvider(provider);

  const [ghStatusState, setGhStatusState] = useState<string | undefined>(
    undefined,
  );
  const [glStatusState, setGlStatusState] = useState<string | undefined>(
    undefined,
  );
  const ghPollingInterval = useDeploymentStatusPollingInterval(ghStatusState);
  const glPollingInterval = useDeploymentStatusPollingInterval(glStatusState);

  const { data: ghCommits } = useGetGitHubCommitsQuery(
    {
      owner: config.owner,
      repo: config.repoName,
      page: 1,
      per_page: 4,
      sha: config.branch,
    },
    {
      skip:
        !isGitHub ||
        !config.owner ||
        !config.repoName ||
        !config.branch ||
        !config.token,
    },
  );

  const { data: glCommits } = useGetGitLabCommitsQuery(
    {
      id: `${config.owner}/${config.repoName}`,
      ref: config.branch,
      page: 1,
      per_page: 4,
    },
    {
      skip: !isGitLab || !config.repoName || !config.branch || !config.token,
    },
  );

  const latestGHCommit =
    ghCommits && ghCommits.length > 0 ? ghCommits[0] : null;
  const latestGLCommit =
    glCommits && glCommits.length > 0 ? glCommits[0] : null;
  const latestGhCommitRef = latestGHCommit?.sha;
  const latestGlCommitRef = latestGLCommit?.id;

  const { data: ghStatus, isLoading: isGhStatusLoading } =
    useGetGitHubCommitStatusQuery(
      {
        owner: config.owner,
        repo: config.repoName,
        ref: latestGhCommitRef!,
      },
      {
        skip:
          !isGitHub ||
          !config.owner ||
          !config.repoName ||
          !latestGhCommitRef ||
          !canAccessPremiumFeatures,
        pollingInterval: ghPollingInterval,
      },
    );
  const ghStatusStateFromData =
    typeof ghStatus === "object" && ghStatus !== null
      ? (ghStatus as any).state
      : ghStatus;

  const { data: glStatus, isLoading: isGlStatusLoading } =
    useGetGitLabCommitStatusQuery(
      {
        id: project?.repository,
        sha: latestGlCommitRef,
      },
      {
        skip:
          !isGitLab ||
          !project?.repository ||
          !latestGlCommitRef ||
          !canAccessPremiumFeatures,
        pollingInterval: glPollingInterval,
      },
    );
  const glStatusStateFromData =
    typeof glStatus === "object" && glStatus !== null
      ? (glStatus as any).state
      : glStatus;

  useEffect(() => {
    setGhStatusState(ghStatusStateFromData);
  }, [ghStatusStateFromData]);
  useEffect(() => {
    setGlStatusState(glStatusStateFromData);
  }, [glStatusStateFromData]);

  const buildStatus = isGitLab ? glStatusStateFromData : ghStatusStateFromData;
  const isStatusLoading = isGitLab ? isGlStatusLoading : isGhStatusLoading;
  const latestCommitDate = isGitLab
    ? latestGLCommit?.committed_date
    : latestGHCommit?.commit?.author?.date;

  const latestCommitAuthor = isGitLab
    ? latestGLCommit?.author_name
    : latestGHCommit?.commit?.author?.name;

  const lastUpdated = latestCommitDate
    ? formatDistanceToNow(new Date(latestCommitDate), { addSuffix: false })
    : lastLog?.createdAt
      ? formatDistanceToNow(new Date(lastLog.createdAt), { addSuffix: false })
      : tDashboard("recently");

  const lastAuthor =
    latestCommitAuthor || lastLog?.user_name || tCommon("system");

  const siteUrl = project?.site_url;

  // Screenshot caching with IndexedDB
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);

  // Clean up legacy localStorage previews once on mount
  useEffect(() => {
    clearOldLocalStoragePreviews();
  }, []);

  const handleFetchScreenshot = useCallback(
    async (force = false) => {
      if (!siteUrl) {
        setScreenshotUrl(null);
        setIsImageLoading(false);
        return;
      }

      const cacheKey = canAccessPremiumFeatures
        ? "preview_" + siteUrl
        : "preview_og_" + siteUrl;

      // Check IndexedDB cache first if not forcing
      if (!force) {
        const cached = await getCachedScreenshot(cacheKey);
        if (cached) {
          setScreenshotUrl(cached);
          setIsImageLoading(false);
          return;
        }
      }

      setIsImageLoading(true);
      setHasImageError(false);

      const normalizedUrl = siteUrl.startsWith("http")
        ? siteUrl
        : "https://" + siteUrl;

      try {
        const res = await fetchProjectPreviewImage({
          url: normalizedUrl,
          premium: canAccessPremiumFeatures,
        });
        if (!res.success) {
          throw new Error(res.error);
        }
        await setCachedScreenshot(cacheKey, res.data);
        setScreenshotUrl(res.data);
      } catch (err) {
        console.warn("Failed to fetch project preview image", err);
        setHasImageError(true);
      } finally {
        setIsImageLoading(false);
      }
    },
    [siteUrl, canAccessPremiumFeatures],
  );

  useEffect(() => {
    handleFetchScreenshot();
  }, [handleFetchScreenshot]);

  const cleanUrl = siteUrl ? siteUrl.replace(/^https?:\/\//, "") : "";

  return (
    <div className="border-border bg-card text-card-foreground grid grid-cols-1 md:grid-cols-12 rounded-lg border">
      {/* Left Column: Preview */}
      <div className="group relative flex items-center justify-center p-6 md:col-span-7 lg:col-span-6">
        {isImageLoading && !hasImageError ? (
          <Skeleton className="aspect-video w-full rounded-md" />
        ) : screenshotUrl && !hasImageError ? (
          <div className="border-border relative w-full overflow-hidden rounded-md border">
            <img
              src={screenshotUrl}
              alt={`Live preview of ${project?.project_name}`}
              className="w-full object-contain"
              onError={() => setHasImageError(true)}
            />
            {/* Hover overlay with refresh button */}
            {canAccessPremiumFeatures && (
              <div className="absolute inset-0 flex items-center justify-center bg-[black]/40 opacity-0 transition-opacity group-hover:opacity-100">
                <Button
                  variant="default"
                  onClick={() => handleFetchScreenshot(true)}
                  isLoading={isImageLoading}
                >
                  {!isImageLoading && <RefreshCw className="mr-1 size-4" />}
                  {tDashboard("refetch_preview")}
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="border-border bg-muted/5 flex aspect-video w-full items-center justify-center rounded-md border">
            <Badge
              variant="outline"
              className="text-muted-foreground font-normal"
            >
              {tDashboard("preview_unavailable")}
            </Badge>
          </div>
        )}
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
              {canAccessPremiumFeatures && isStatusLoading ? (
                <Loader2 className="size-4 animate-spin opacity-50" />
              ) : canAccessPremiumFeatures &&
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
