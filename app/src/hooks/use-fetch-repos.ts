import {
  isGitHubProvider,
  isGitLabProvider,
} from "@/lib/utils/provider-checker";
import { selectConfig } from "@/redux/features/config/slice";
import {
  useGetGitHubInstallationsQuery,
  useLazyGetGitHubReposByInstallationIdQuery,
  useLazySearchGitHubReposQuery,
} from "@/redux/features/github";
import { useLazyGetGitLabReposQuery } from "@/redux/features/gitlab/gitlab-api";
import { useAppSelector } from "@/redux/store";
import { useEffect, useState } from "react";

export const useAllInstallationRepos = (override?: {
  provider?: string;
  token?: string;
  search?: string;
}): {
  repositories: any[];
  isLoading: boolean;
  error: unknown;
  refetch: (search?: string) => Promise<any[]>;
} => {
  const globalConfig = useAppSelector(selectConfig);
  const config = {
    ...globalConfig,
    provider: override?.provider || globalConfig.provider,
    token:
      override?.token ||
      (override?.provider && override.provider !== globalConfig.provider
        ? undefined
        : globalConfig.token),
  };

  const {
    data: installationsData,
    isLoading: isLoadingInstallations,
    refetch: refetchInstallations,
    isUninitialized: isGithubUninitialized,
  } = useGetGitHubInstallationsQuery(
    { token: config.token },
    {
      // GET /user/installations requires a GitHub App user access token.
      // Classic PATs and OAuth App tokens return 401 — skip if no user token.
      skip:
        !config.token ||
        !isGitHubProvider(config.provider) ||
        !config.currentLoginUserToken,
    },
  );

  const [getReposByInstallationId] =
    useLazyGetGitHubReposByInstallationIdQuery();
  const [searchGitHubRepositories] = useLazySearchGitHubReposQuery();
  const [getGitLabProjects] = useLazyGetGitLabReposQuery();

  const [repositories, setRepositories] = useState<any[]>([]);
  const [isFetchingRepos, setIsFetchingRepos] = useState(false);
  const [fetchError, setFetchError] = useState<unknown>(null);

  const fetchAllRepos = async (
    active: { current: boolean },
    searchQuery?: string,
  ) => {
    setIsFetchingRepos(true);
    setFetchError(null);

    try {
      // GitLab Logic
      if (isGitLabProvider(config.provider)) {
        if (!config.token) {
          setRepositories([]);
          return [];
        }

        // Pass search param if exists, otherwise just page 1 (limit 100)
        // If search exists, GitLab API handles filtering
        const result = await getGitLabProjects({
          token: config.token,
          search: searchQuery,
          per_page: 100,
          page: 1,
        }).unwrap();

        if (!active.current) return [];

        // Normalize GitLab projects
        const normalized = result.map((proj: any) => ({
          name: proj.name,
          owner: { login: proj.namespace?.path || "Gitlab" },
          html_url: proj.web_url,
          homepage: proj.web_url,
          visibility: proj.visibility,
          full_name: proj.path_with_namespace,
          id: proj.id,
          default_branch: proj.default_branch,
        }));

        setRepositories(normalized);
        return normalized;
      }

      // GitHub Logic
      if (
        !installationsData?.installations ||
        !isGitHubProvider(config.provider)
      ) {
        setRepositories([]);
        return [];
      }

      const allRepos: any[] = [];

      // If searching, we use the Search API
      if (searchQuery) {
        // Search API is global, but we want to scope it to the user's installations if possible.
        // However, searching 'user:name q' is for a specific user.
        // For installations, it's tricker.
        // Strategy: Search for the query scoped to each installation account login.
        // active accounts are in `installationsData.installations`.

        for (const installation of installationsData.installations) {
          if (!active.current) break;

          try {
            // "user:ownerName query"
            const accountLogin =
              (installation.account as any)?.login ||
              (installation.account as any)?.slug;
            if (!accountLogin) continue;

            const q = `user:${accountLogin} ${searchQuery} in:name`;
            const result = await searchGitHubRepositories({
              q,
              per_page: 100,
              page: 1,
            }).unwrap();

            if (result.items) {
              allRepos.push(...result.items);
            }
          } catch (err) {
            console.error(
              `Failed to search repos for ${installation.account?.id}`,
              err,
            );
            // continue to next installation
          }
        }
      } else {
        // No search query -> Fetch first page of each installation
        for (const installation of installationsData.installations) {
          if (!active.current) break;

          try {
            const result = await getReposByInstallationId({
              installation_id: installation.id,
              per_page: 100,
              page: 1,
              token: config.token,
            }).unwrap();

            const reposPage = result.repositories ?? [];
            allRepos.push(...reposPage);
          } catch (err) {
            console.error(
              `Failed to fetch repos for installation ${installation.id}`,
              err,
            );
            // continue
          }
        }
      }

      if (active.current) {
        setRepositories(allRepos);
      }
      return allRepos;
    } catch (err) {
      if (active.current) {
        setFetchError(err);
        setRepositories([]);
      }
      return [];
    } finally {
      if (active.current) {
        setIsFetchingRepos(false);
      }
    }
  };

  // Clear repositories when provider changes to prevent showing stale data
  useEffect(() => {
    setRepositories([]);
  }, [config.provider]);

  // Refetch repos when installationsData updates or provider changes
  useEffect(() => {
    const active = { current: true };

    if (
      (isGitHubProvider(config.provider) &&
        installationsData?.installations?.length) ||
      (isGitLabProvider(config.provider) && config.token)
    ) {
      fetchAllRepos(active, override?.search);
    } else {
      setRepositories([]);
    }

    return () => {
      active.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [installationsData, config.provider, config.token, override?.search]);

  return {
    repositories,
    isLoading:
      (isGitHubProvider(config.provider) ? isLoadingInstallations : false) ||
      isFetchingRepos,
    error: fetchError,
    refetch: async (search?: string) => {
      if (isGitHubProvider(config.provider) && !isGithubUninitialized) {
        await refetchInstallations();
      }
      return fetchAllRepos({ current: true }, search);
    },
  };
};
