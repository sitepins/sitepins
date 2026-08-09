"use client";

import { useOrgMember, usePermission } from "@/hooks/use-permission";
import { ENUM_PERMISSIONS } from "@/lib/roles";
import { useGetProjectQuery } from "@/redux/features/project/project-api";
import { use } from "react";
import ArchiveProject from "./_components/archive-project";
import DeleteProject from "./_components/delete-project";
import MoveProject from "./_components/move-project";
import ProjectAvatar from "./_components/project-avatar";
import ProjectForm from "./_components/project-form";
import { ProjectGeneralSkeleton } from "./_components/project-general-skeleton";

export default function GeneralSettingsPage({
  params,
}: PageProps<"/[locale]/[orgId]/[projectId]/settings/general">) {
  const { orgId, projectId } = use(params);

  const orgIdSafe = orgId.startsWith("org-") ? orgId.slice(4) : orgId;

  const { data: project, isLoading: isProjectLoading } = useGetProjectQuery(
    { projectId: projectId, orgId: orgIdSafe },
    { skip: !orgIdSafe },
  );

  const canUpdateSettings = usePermission(ENUM_PERMISSIONS.MANAGE_PROJECTS);
  const canPerformDestructiveActions = usePermission(
    ENUM_PERMISSIONS.DELETE_ORG,
  );
  const { isLoading: isMemberLoading } = useOrgMember();

  if (isProjectLoading || isMemberLoading) {
    return <ProjectGeneralSkeleton />;
  }

  return (
    <>
      {project && <ProjectAvatar {...project} canUpdate={canUpdateSettings} />}
      {project && <ProjectForm {...project} canUpdate={canUpdateSettings} />}

      {canPerformDestructiveActions && (
        <>
          <MoveProject
            id={project?.project_id ?? ""}
            org_id={project?.org_id ?? ""}
          />

          {project ? (
            <ArchiveProject
              id={project?.project_id ?? ""}
              org_id={project?.org_id ?? ""}
              status={project?.status}
            />
          ) : null}

          <DeleteProject
            id={project?.project_id ?? ""}
            org_id={project?.org_id ?? ""}
          />
        </>
      )}
    </>
  );
}
