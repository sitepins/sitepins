import { updateConfig } from "@/redux/features/config/slice";
import { useAppDispatch, useAppSelector } from "@/redux/store";
import { useEffect, useState } from "react";

export function useProjectBranch(project: any) {
  const dispatch = useAppDispatch();
  const config = useAppSelector((state) => state.config);
  const [restoredProjectId, setRestoredProjectId] = useState<string | null>(
    null,
  );

  // Restore the last working branch or default
  useEffect(() => {
    // If project is not loaded yet, do nothing
    if (!project?.project_id) return;

    // If we have already restored for this project ID, do nothing
    if (restoredProjectId === project.project_id) {
      return;
    }

    const storedBranch = localStorage.getItem(
      `last_working_branch_${project.project_id}`,
    );

    if (storedBranch) {
      // Restore stored branch if different from current
      if (config.branch !== storedBranch) {
        dispatch(updateConfig({ branch: storedBranch }));
      }
    } else if (project.branch) {
      // Fallback to default branch if different from current
      if (config.branch !== project.branch) {
        dispatch(updateConfig({ branch: project.branch }));
      }
    }

    setRestoredProjectId(project.project_id);
  }, [
    project?.project_id,
    project?.branch,
    restoredProjectId,
    dispatch,
    config.branch,
  ]); // config.branch excluded to avoid fighting with user changes

  // Persist the last working branch
  useEffect(() => {
    // Only persist if we have restored for this specific project
    // This prevents overwriting the storage with default values before restoration happens
    if (
      project?.project_id &&
      config.branch &&
      restoredProjectId === project.project_id
    ) {
      try {
        localStorage.setItem(
          `last_working_branch_${project.project_id}`,
          config.branch,
        );
      } catch (e) {
        console.warn("Failed to persist last working branch in localStorage", e);
      }
    }
  }, [project?.project_id, config.branch, restoredProjectId]);

  return { branch: config.branch };
}
