"use client";

import { Button } from "@/components/ui/button";
import { GITHUB_APP_NAME } from "@/lib/constant";
import { errorStatus } from "@/lib/utils/error";
import { isGitLabProvider } from "@/lib/utils/provider-checker";
import { selectConfig } from "@/redux/features/config/slice";
import { useGetGitHubRepoQuery } from "@/redux/features/github";
import { useGetGitLabSingleRepoQuery } from "@/redux/features/gitlab/gitlab-api";
import { TProject } from "@/redux/features/project/type";
import { useAppSelector } from "@/redux/store";
import { ExternalLink, RefreshCw, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";

export default function RepoAccessBanner({
  project,
}: {
  project: TProject | undefined;
}) {
  const t = useTranslations("dashboard");
  const config = useAppSelector(selectConfig);

  const providerReady =
    Boolean(project?.provider) &&
    isGitLabProvider(project?.provider) === isGitLabProvider(config.provider);
  const isGitLab = providerReady && isGitLabProvider(config.provider);
  const isGitHub = providerReady && !isGitLab;

  // Same arguments as the overview page so the banner shares its cache entry.
  const github = useGetGitHubRepoQuery(
    { owner: config.owner, repo: config.repoName },
    {
      skip: !isGitHub || !config.owner || !config.repoName,
      refetchOnFocus: true,
    },
  );
  const gitlab = useGetGitLabSingleRepoQuery(
    { projectId: project?.repository || "", token: config.token },
    {
      skip: !isGitLab || !project?.repository || !config.token,
      refetchOnFocus: true,
    },
  );

  const query = isGitLab ? gitlab : github;
  if (!providerReady || errorStatus(query.error) !== 404) return null;

  const repository =
    project?.repository || `${config.owner}/${config.repoName}`;

  return (
    <div
      role="alert"
      className="border-border bg-destructive/10 w-full border-b"
    >
      <div className="flex flex-col gap-2.5 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-6 md:px-6">
        <div className="flex min-w-0 gap-2.5">
          <TriangleAlert className="text-destructive mt-0.5 size-4 shrink-0" />
          <p className="text-sm leading-5">
            <span className="text-foreground font-medium">
              {t.rich("repo_access.title", {
                repository,
                repo: (chunks) => (
                  <code className="bg-background/60 rounded px-1 py-0.5 font-mono text-[0.8125rem]">
                    {chunks}
                  </code>
                ),
              })}
            </span>
            <span className="text-muted-foreground block sm:ms-1.5 sm:inline">
              {isGitLab
                ? t("repo_access.gitlab_description")
                : t("repo_access.github_description", {
                    app: GITHUB_APP_NAME,
                  })}
            </span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 ps-6.5 sm:ps-0">
          {isGitHub && (
            <Button size="xs" asChild>
              <a
                href={`https://github.com/apps/${GITHUB_APP_NAME}/installations/select_target`}
                target="_blank"
                rel="noreferrer"
              >
                {t("repo_access.manage_access")}
                <ExternalLink />
              </a>
            </Button>
          )}
          <Button
            size="xs"
            variant="ghost"
            onClick={() => query.refetch()}
            isLoading={query.isFetching}
          >
            {!query.isFetching && <RefreshCw />}
            {t("repo_access.retry")}
          </Button>
        </div>
      </div>
    </div>
  );
}
