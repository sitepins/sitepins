import { isGitLabProvider } from "@/lib/utils/provider-checker";
import { selectConfig } from "@/redux/features/config/slice";
import { getGitProviderAdapter } from "@/redux/features/git/provider-adapter";
import { useGetGitHubRepoQuery } from "@/redux/features/github";
import { useGetGitLabSingleRepoQuery } from "@/redux/features/gitlab/gitlab-api";
import { useUpdateGitConnectionMutation } from "@/redux/features/project/project-api";
import { TProject } from "@/redux/features/project/type";
import { useAppSelector } from "@/redux/store";
import { useEffect, useRef } from "react";

/**
 * Keeps a project addressable after its repository has been renamed.
 *
 * Both providers answer a GET on the old path with a redirect, so reads keep
 * working and nothing looks broken — but writes do not survive it:
 *
 * - GitLab rejects every non-GET method outright ("Non GET methods are not
 *   allowed for moved projects").
 * - GitHub returns 301, and the Fetch spec rewrites a redirected POST/PUT to
 *   GET and drops the body, so the write silently never happens.
 *
 * The repository lookup follows the redirect and reports the current path, so
 * that response is where a stale stored path can be detected and corrected.
 * GitLab additionally yields a numeric id, which no rename can invalidate;
 * GitHub has no id-addressable write endpoints, so only its path is tracked.
 *
 * Called from the project layout so it covers every route — otherwise opening
 * a file directly would leave the stale path in place for the whole session.
 */
export const useRepositoryPathSync = (project: TProject | undefined) => {
  const config = useAppSelector(selectConfig);
  const [updateGitConnection] = useUpdateGitConnectionMutation();
  const syncedRef = useRef(false);

  // Both providers agree, or we are mid-switch and should not touch anything.
  const providerReady =
    Boolean(project?.provider) &&
    isGitLabProvider(project?.provider) === isGitLabProvider(config.provider);
  const isGitLab = providerReady && isGitLabProvider(config.provider);
  const isGitHub = providerReady && !isGitLab;

  // Arguments mirror the overview page's own lookups so both share one cache
  // entry rather than issuing a second request.
  const { data: githubRepo } = useGetGitHubRepoQuery(
    { owner: config.owner, repo: config.repoName },
    { skip: !isGitHub || !config.owner || !config.repoName },
  );

  const { data: gitlabRepo } = useGetGitLabSingleRepoQuery(
    { projectId: project?.repository || "", token: config.token },
    { skip: !isGitLab || !project?.repository || !config.token },
  );

  const repo = isGitLab ? gitlabRepo : githubRepo;

  useEffect(() => {
    if (!project || !repo || syncedRef.current) return;

    const adapter = getGitProviderAdapter(project.provider);
    const { path, id } = adapter.canonicalRepo(repo);

    const pathChanged = Boolean(path) && project.repository !== path;
    const idChanged = Boolean(id) && project.repository_id !== id;
    if (!pathChanged && !idChanged) return;

    syncedRef.current = true;
    updateGitConnection({
      project_id: project.project_id,
      org_id: project.org_id,
      ...(pathChanged ? { repository: path } : {}),
      ...(idChanged ? { repository_id: id } : {}),
    })
      .unwrap()
      .catch(() => {
        syncedRef.current = false;
      });
  }, [project, repo, updateGitConnection]);
};
