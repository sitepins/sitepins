import { MdxSnippet } from "@/editor/utils/plate-types";
import {
  isGitHubProvider,
  isGitLabProvider,
} from "@/lib/utils/provider-checker";
import { selectConfig } from "@/redux/features/config/slice";
import { useGetGitHubSnippetsQuery } from "@/redux/features/github";
import { useGetGitLabSnippetsQuery } from "@/redux/features/gitlab";
import { skipToken } from "@reduxjs/toolkit/query";
import { useParams, usePathname } from "next/navigation";
import path from "path";
import { useMemo } from "react";
import { useSelector } from "react-redux";

interface UseSnippetsResult {
  snippets: MdxSnippet[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export const useSnippets = (): UseSnippetsResult => {
  const config = useSelector(selectConfig);
  const pathname = usePathname();
  // try to derive current group/schema from route params when available
  const params = useParams() as
    | { file?: string[]; path?: string[] }
    | undefined;

  const isConfig = useMemo(() => {
    if (!pathname) return false;
    return pathname.includes("/configs/");
  }, [pathname]);

  const queryArgs = useMemo(() => {
    if (
      !config.owner ||
      !config.branch ||
      (isGitHubProvider(config.provider) && !config.repoName) ||
      isConfig
    ) {
      return skipToken;
    }

    if (isGitLabProvider(config.provider)) {
      return {
        id: config.repoName
          ? `${config.owner}/${config.repoName}`
          : config.owner,
        ref: config.branch,
      } as const;
    }

    return {
      owner: config.owner,
      repo: config.repoName,
      ref: config.branch,
    } as const;
  }, [config.owner, config.branch, config.provider, config.repoName, isConfig]);

  const {
    data: ghData,
    isLoading: isGhLoading,
    isError: isGhError,
    refetch: ghRefetch,
    isFetching: isGhFetching,
  } = useGetGitHubSnippetsQuery(queryArgs as any, {
    skip: queryArgs === skipToken || !isGitHubProvider(config.provider),
  });

  const {
    data: glData,
    isLoading: isGlLoading,
    isError: isGlError,
    refetch: glRefetch,
    isFetching: isGlFetching,
  } = useGetGitLabSnippetsQuery(queryArgs as any, {
    skip: queryArgs === skipToken || !isGitLabProvider(config.provider),
  });

  const data = isGitLabProvider(config.provider) ? glData : ghData;
  const isLoading = isGitLabProvider(config.provider)
    ? isGlLoading
    : isGhLoading;
  const isError = isGitLabProvider(config.provider) ? isGlError : isGhError;
  const refetch = isGitLabProvider(config.provider) ? glRefetch : ghRefetch;
  const isFetching = isGitLabProvider(config.provider)
    ? isGlFetching
    : isGhFetching;

  const fallbackSnippets = useMemo(
    () => config.snippets ?? [],
    [config.snippets],
  );

  const resolvedSnippets = data ?? fallbackSnippets;

  // derive current group name (schema identifier) from the route's file or path param
  const groupName = useMemo(() => {
    try {
      const fileArr = params?.file || params?.path;
      if (!fileArr || !Array.isArray(fileArr) || fileArr.length === 0)
        return undefined;
      const filePathString = decodeURIComponent(fileArr.join("/"))
        .replaceAll("%5B", "[")
        .replaceAll("%5D", "]");
      // groupName is the folder that contains the file (same logic as Single)
      return path.basename(path.dirname(filePathString));
    } catch (e) {
      return undefined;
    }
  }, [params?.file, params?.path]);

  const filtered = useMemo(() => {
    if (!groupName) {
      // no context: return snippets that don't restrict by schema (or all)
      return resolvedSnippets.filter(
        (s) => !Array.isArray(s.schema) || s.schema.length === 0,
      );
    }

    return resolvedSnippets.filter((s) => {
      // if snippet doesn't declare schema, show everywhere
      if (!Array.isArray(s.schema) || s.schema.length === 0) return true;
      const allowed = s.schema.map((x: string) => x.toLowerCase());
      return allowed.includes(groupName.toLowerCase());
    });
  }, [resolvedSnippets, groupName]);

  return {
    snippets: filtered,
    isLoading: isLoading || isFetching,
    isError,
    refetch,
  };
};
