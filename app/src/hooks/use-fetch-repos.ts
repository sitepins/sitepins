import { logger } from "@/lib/logger";
import {
  isGitHubProvider,
  isGitLabProvider,
} from "@/lib/utils/provider-checker";
import { selectConfig } from "@/redux/features/config/slice";
import {
  githubContentApi,
  useGetGitHubInstallationsQuery,
} from "@/redux/features/github";
import { useLazyGetGitLabReposQuery } from "@/redux/features/gitlab/gitlab-api";
import { useAppDispatch, useAppSelector } from "@/redux/store";
import { TGitRepo } from "@/types";
import { useCallback, useEffect, useRef, useState } from "react";

const PAGE_SIZE = 100;
const MAX_PARALLEL_REQUESTS = 6;

const createLimiter = (max: number) => {
  let active = 0;
  const queue: (() => void)[] = [];
  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (active >= max) {
      await new Promise<void>((resolve) => queue.push(resolve));
    } else {
      active++;
    }
    try {
      return await task();
    } finally {
      // Hand the slot straight to the next waiter so `active` never overshoots.
      const next = queue.shift();
      if (next) next();
      else active--;
    }
  };
};

export const useAllInstallationRepos = (override?: {
  provider?: string;
  token?: string;
  search?: string;
  skip?: boolean;
}): {
  repositories: TGitRepo[];
  isLoading: boolean;
  error: unknown;
  refetch: (search?: string) => Promise<TGitRepo[]>;
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

  const userToken = config.currentLoginUserToken || config.token;

  const {
    data: installationsData,
    isLoading: isLoadingInstallations,
    refetch: refetchInstallations,
    isUninitialized: isGithubUninitialized,
  } = useGetGitHubInstallationsQuery(
    { token: userToken },
    {
      // GET /user/installations requires a GitHub App user access token.
      // Classic PATs and OAuth App tokens return 401 — skip if no user token.
      skip:
        override?.skip ||
        !userToken ||
        !isGitHubProvider(config.provider) ||
        !config.currentLoginUserToken,
    },
  );

  const dispatch = useAppDispatch();
  const [getGitLabProjects] = useLazyGetGitLabReposQuery();

  const [repositories, setRepositories] = useState<TGitRepo[]>([]);
  const [isFetchingRepos, setIsFetchingRepos] = useState(false);
  const [fetchError, setFetchError] = useState<unknown>(null);

  // GitHub loads every repo once and the combobox filters locally, so only
  // GitLab searches server-side.
  const remoteSearch = isGitLabProvider(config.provider)
    ? override?.search
    : undefined;

  const fetchGitLabRepos = async (
    active: { current: boolean },
    searchQuery: string | undefined,
    fresh: boolean,
  ) => {
    if (!config.token) {
      setRepositories([]);
      return [];
    }

    const result = await getGitLabProjects(
      {
        token: config.token,
        search: searchQuery,
        per_page: PAGE_SIZE,
        page: 1,
      },
      !fresh,
    ).unwrap();

    if (!active.current) return [];

    const normalized: TGitRepo[] = result.map((proj) => ({
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
  };

  const fetchGitHubRepos = async (
    active: { current: boolean },
    fresh: boolean,
  ) => {
    const installations = installationsData?.installations ?? [];
    if (!installations.length) {
      setRepositories([]);
      return [];
    }

    const limit = createLimiter(MAX_PARALLEL_REQUESTS);
    const fetchPage = (installation_id: number, page: number) =>
      limit(() =>
        dispatch(
          githubContentApi.endpoints.getGitHubReposByInstallationId.initiate(
            { installation_id, per_page: PAGE_SIZE, page, token: config.token },
            { subscribe: false, forceRefetch: fresh },
          ),
        ).unwrap(),
      );

    const perInstallation: TGitRepo[][] = installations.map(() => []);
    const publish = () => {
      if (active.current) setRepositories(perInstallation.flat());
    };

    await Promise.all(
      installations.map(async (installation, index) => {
        try {
          const first = await fetchPage(installation.id, 1);
          const pageCount = Math.ceil(first.total_count / PAGE_SIZE);
          const rest = await Promise.all(
            Array.from({ length: Math.max(pageCount - 1, 0) }, (_, i) =>
              fetchPage(installation.id, i + 2),
            ),
          );
          perInstallation[index] = [first, ...rest].flatMap((result) =>
            (result.repositories ?? []).map((repo) => ({
              ...repo,
              id: typeof repo.id === "bigint" ? repo.id.toString() : repo.id,
            })),
          );
          publish();
        } catch (err) {
          logger.error(
            `Failed to fetch repos for installation ${installation.id}`,
            err,
          );
        }
      }),
    );

    return perInstallation.flat();
  };

  const fetchAllRepos = async (
    active: { current: boolean },
    options: { search?: string; fresh?: boolean } = {},
  ) => {
    setIsFetchingRepos(true);
    setFetchError(null);

    try {
      if (isGitLabProvider(config.provider)) {
        return await fetchGitLabRepos(
          active,
          options.search,
          Boolean(options.fresh),
        );
      }
      if (!isGitHubProvider(config.provider)) {
        setRepositories([]);
        return [];
      }
      return await fetchGitHubRepos(active, Boolean(options.fresh));
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
  const [loadedProvider, setLoadedProvider] = useState(config.provider);
  if (loadedProvider !== config.provider) {
    setLoadedProvider(config.provider);
    setRepositories([]);
  }

  useEffect(() => {
    const active = { current: true };

    if (
      !override?.skip &&
      ((isGitHubProvider(config.provider) &&
        installationsData?.installations?.length) ||
        (isGitLabProvider(config.provider) && config.token))
    ) {
      // fetchAllRepos sets loading/error state synchronously before its first await
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchAllRepos(active, { search: remoteSearch });
    } else {
      setRepositories([]);
    }

    return () => {
      active.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    installationsData,
    config.provider,
    config.token,
    remoteSearch,
    override?.skip,
  ]);

  const latest = useRef({
    fetchAllRepos,
    refetchInstallations,
    isGithubUninitialized,
    provider: config.provider,
  });
  useEffect(() => {
    latest.current = {
      fetchAllRepos,
      refetchInstallations,
      isGithubUninitialized,
      provider: config.provider,
    };
  });

  // Stable identity: callers list it as an effect dependency.
  const refetch = useCallback(async (search?: string) => {
    const current = latest.current;
    if (isGitHubProvider(current.provider) && !current.isGithubUninitialized) {
      await current.refetchInstallations();
    }
    return current.fetchAllRepos({ current: true }, { search, fresh: true });
  }, []);

  return {
    repositories,
    isLoading:
      (isGitHubProvider(config.provider) ? isLoadingInstallations : false) ||
      isFetchingRepos,
    error: fetchError,
    refetch,
  };
};
