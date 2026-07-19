"use client";

import Container from "@/components/container";
import { isDemoUrl } from "@/lib/utils/demo-urls";
import detectFramework from "@/lib/utils/framework-detector";
import {
  isGitHubProvider,
  isGitLabProvider,
} from "@/lib/utils/provider-checker";
import { selectConfig } from "@/redux/features/config/slice";
import {
  useGetGitHubRepoQuery,
  useGetGitHubTreesQuery,
} from "@/redux/features/github";
import {
  useGetGitLabRepoTreeQuery,
  useGetGitLabSingleRepoQuery,
} from "@/redux/features/gitlab/gitlab-api";
import { useGetProjectLogQuery } from "@/redux/features/project-log/project-log-api";
import {
  useGetProjectQuery,
  useUpdateProjectGeneratorMutation,
  useUpdateProjectMutation,
  useUpdateProjectVisibilityMutation,
} from "@/redux/features/project/project-api";
import { use, useEffect, useMemo, useRef } from "react";
import { useSelector } from "react-redux";
import AppActivity from "./_components/app-activity";
import GitActivity from "./_components/git-activity";
import ProjectArchived from "./_components/project-archived";
import ProjectBranching from "./_components/project-branching";
import ProjectOverview from "./_components/project-overview";
import { ProjectOverviewSkeleton } from "./_components/project-overview-skeleton";
import ProjectSetupSteps from "./_components/project-setup-steps";
import SidebarTriggerMobile from "./_components/sidebar-trigger-mobile";

export default function Project(
  props: PageProps<"/[locale]/[orgId]/[projectId]">,
) {
  const params = use(props.params);
  const config = useSelector(selectConfig);

  const orgIdSafe = params?.orgId
    ? params.orgId.startsWith("org-")
      ? params.orgId.slice(4)
      : params.orgId
    : "";

  const { data: project, isLoading: isProjectLoading } = useGetProjectQuery(
    { projectId: params.projectId, orgId: orgIdSafe },
    { skip: !orgIdSafe },
  );

  const { data: ghRepoInfo } = useGetGitHubRepoQuery(
    { owner: config.owner, repo: config.repoName },
    {
      skip:
        !config.owner ||
        !config.repoName ||
        !isGitHubProvider(project?.provider) ||
        !isGitHubProvider(config.provider),
      refetchOnFocus: true,
    },
  );

  // fetch repo info from GitLab
  const { data: glRepoInfo } = useGetGitLabSingleRepoQuery(
    { projectId: project?.repository || "", token: config.token },
    {
      skip:
        !project?.repository ||
        !isGitLabProvider(project?.provider) ||
        !isGitLabProvider(config.provider),
    },
  );

  const repoInfo = isGitLabProvider(project?.provider)
    ? glRepoInfo
    : ghRepoInfo;

  const [updateProjectVisibility] = useUpdateProjectVisibilityMutation();
  const [updateProjectGenerator] = useUpdateProjectGeneratorMutation();
  const [updateProject] = useUpdateProjectMutation();
  const visibilityUpdatedRef = useRef(false);
  const generatorSyncedRef = useRef(false);
  const siteUrlSyncedRef = useRef(false);

  const repoParts = useMemo(() => {
    if (!project?.repository) {
      return { owner: "", repoName: "" };
    }

    const [owner = "", repoName = ""] = project.repository.split("/");
    return { owner: owner.trim(), repoName: repoName.trim() };
  }, [project?.repository]);

  const shouldDetectGenerator = Boolean(
    project &&
    !project.generator &&
    repoParts.owner &&
    repoParts.repoName &&
    project.branch &&
    config.token,
  );

  const { data: ghTreeData } = useGetGitHubTreesQuery(
    {
      owner: repoParts.owner,
      repo: repoParts.repoName,
      tree_sha: project?.branch ?? "",
      recursive: "1",
      config: config,
    },
    {
      skip:
        !shouldDetectGenerator ||
        !isGitHubProvider(project?.provider) ||
        !isGitHubProvider(config.provider),
    },
  );

  const { data: glTreeData } = useGetGitLabRepoTreeQuery(
    {
      projectId: project?.repository || "",
      ref: project?.branch ?? "",
      recursive: true,
      token: config.token,
    },
    {
      skip:
        !shouldDetectGenerator ||
        !isGitLabProvider(project?.provider) ||
        !isGitLabProvider(config.provider),
    },
  );

  const treeData = isGitLabProvider(project?.provider)
    ? glTreeData
    : ghTreeData;

  // If repo visibility changed, sync it to backend once per open
  useEffect(() => {
    if (!project || !repoInfo) return;

    try {
      const visibility = isGitLabProvider(project.provider)
        ? repoInfo.visibility
        : repoInfo.private
          ? "private"
          : "public";

      if (project.visibility !== visibility && !visibilityUpdatedRef.current) {
        visibilityUpdatedRef.current = true;
        updateProjectVisibility({
          project_id: project.project_id,
          org_id: orgIdSafe,
          visibility: visibility,
        }).catch(() => {
          // reset flag on failure so it may retry later
          visibilityUpdatedRef.current = false;
        });
      }
    } catch (e) {
      // ignore errors here
    }
  }, [project, repoInfo, updateProjectVisibility, orgIdSafe]);

  // Auto-detect framework/generator when missing
  useEffect(() => {
    if (
      generatorSyncedRef.current ||
      !project ||
      project.generator ||
      !treeData?.files?.length
    ) {
      return;
    }

    const detected = detectFramework(treeData.files);
    const generatorValue = detected ?? "undefined";

    generatorSyncedRef.current = true;
    updateProjectGenerator({
      project_id: project.project_id,
      org_id: project.org_id,
      generator: generatorValue,
    }).catch(() => {
      generatorSyncedRef.current = false;
    });
  }, [project, treeData, updateProjectGenerator]);

  // Sync site_url from repo homepage
  useEffect(() => {
    const homepage = isGitLabProvider(project?.provider)
      ? repoInfo?.web_url
      : repoInfo?.homepage;

    if (
      !project ||
      !repoInfo ||
      siteUrlSyncedRef.current ||
      project.site_url ||
      !homepage ||
      isDemoUrl(homepage)
    ) {
      return;
    }

    siteUrlSyncedRef.current = true;
    updateProject({
      project_id: project.project_id,
      org_id: project.org_id,
      site_url: homepage,
    }).catch(() => {
      siteUrlSyncedRef.current = false;
    });
  }, [project, repoInfo, updateProject]);

  const projectLogQuery = useGetProjectLogQuery(project?.project_id ?? "", {
    skip: !project?.project_id,
  });

  if (!config.token || isProjectLoading) {
    return <ProjectOverviewSkeleton />;
  }

  return (
    <Container>
      <ProjectOverview
        project={project}
        config={config}
        projectLogQuery={projectLogQuery}
      />
      {project?.status === "archived" ? (
        <ProjectArchived />
      ) : (
        <>
          <ProjectBranching
            project={project}
            config={config}
            repoInfo={repoInfo}
          />
          <ProjectSetupSteps
            project={project}
            projectLogQuery={projectLogQuery}
            refetchRepo={() => {}}
          />
          {config.content && <SidebarTriggerMobile />}
          <AppActivity projectLogQuery={projectLogQuery} />
          <GitActivity />
        </>
      )}
    </Container>
  );
}
