"use client";

import EllipsisPagination from "@/components/ellipsis-pagination";
import { useGitProvider } from "@/hooks/use-git-provider";
import config from "@/lib/config";
import { checkMedia } from "@/lib/utils/check-media-file";
import { findFileByPath } from "@/lib/utils/common";
import {
  isGitHubProvider,
  isGitLabProvider,
} from "@/lib/utils/provider-checker";
import { selectFileMetadata } from "@/redux/features/config/meta-slice";
import { selectConfig } from "@/redux/features/config/slice";
import { useGetGitHubTreesQuery } from "@/redux/features/github";
import { useGetGitLabTreesQuery } from "@/redux/features/gitlab";
import { redirect, useSearchParams } from "next/navigation";
import { use, useMemo } from "react";
import { useSelector } from "react-redux";
import MediaManager from "./_components/media-manager";
import Loading from "./loading";

const PAGINATION = config.pagination.media_limit;

export default function MainPage(
  props: PageProps<"/[locale]/[orgId]/[projectId]/media/[...path]">,
) {
  const gitMeta = useSelector(selectFileMetadata);
  const sortValue =
    useSelector((state: any) => state.media.sortby) || "title-asc";
  const searchParams = useSearchParams();
  const params = use(props.params);
  const config = useSelector(selectConfig);
  const isConfigReady =
    config.token &&
    config.branch &&
    config.provider &&
    config.owner &&
    config.repoName;

  const { data: ghData, isLoading: isGhTreesLoading } = useGetGitHubTreesQuery(
    {
      owner: config.owner,
      repo: config.repoName,
      tree_sha: config.branch,
      recursive: "1",
      config: config,
    },
    {
      skip: !isConfigReady || !isGitHubProvider(config.provider),
    },
  );

  const { data: glData, isLoading: isGlTreesLoading } = useGetGitLabTreesQuery(
    {
      id: config.repoName ? `${config.owner}/${config.repoName}` : config.owner,
      ref: config.branch,
      recursive: true,
      config: config,
    },
    {
      skip: !isConfigReady || !isGitLabProvider(config.provider),
    },
  );

  const { useGitContent, provider } = useGitProvider();

  // Fetch folder content when sorting by date to enrich metadata cache
  const isDateSort =
    sortValue.includes("created") || sortValue.includes("updated");

  const folderPath = params.path.join("/");
  useGitContent(folderPath, {
    skip: !isDateSort,
    config: config,
  });

  const data = isGitLabProvider(provider) ? glData : ghData;
  const isTreesLoading = isConfigReady
    ? isGitLabProvider(config.provider)
      ? isGlTreesLoading
      : isGhTreesLoading
    : true;

  const query = searchParams.get("q") || "";
  const page = searchParams.get("page") || "1";

  const files = data?.trees || [];
  const mediaDir = "media" + "/" + params.path.join("/");

  // files[1] is media folder, but we should find it by name to be safe
  const mediaFolder = files?.find((f) => f.name === "media");
  const childrenFile = findFileByPath(mediaFolder?.children || [], mediaDir);

  const filterResult = useMemo(() => {
    return childrenFile?.children?.filter(
      (item) =>
        item.name !== ".well-known" &&
        (!item.isFile || checkMedia(item.path || item.name)),
    );
  }, [childrenFile?.children]);

  const toTimestamp = useMemo(() => {
    return (value?: string) => {
      if (!value) return undefined;
      const timestamp = Date.parse(value);
      return Number.isNaN(timestamp) ? undefined : timestamp;
    };
  }, []);

  const sortedFiles = useMemo(() => {
    if (!filterResult || filterResult.length === 0) return filterResult;

    let result = [...filterResult];

    if (query) {
      const searchQuery = query.toLowerCase().trim();
      const searchTerms = searchQuery.split(/\s+/).filter(Boolean);
      result = result.filter((item) => {
        const fileName = item.name.toLowerCase();
        const filePath = item.path?.toLowerCase() || "";
        return searchTerms.every(
          (term) => fileName.includes(term) || filePath.includes(term),
        );
      });
    }

    return result.sort((a, b) => {
      if (sortValue === "title-asc") {
        return a.name.localeCompare(b.name);
      } else if (sortValue === "title-desc") {
        return b.name.localeCompare(a.name);
      } else if (
        sortValue.includes("created") ||
        sortValue.includes("updated")
      ) {
        const isCreated = sortValue.includes("created");
        const isDesc = sortValue.includes("desc");

        const cacheKey = `${config.owner}/${config.repoName}/${config.branch}/${a.path.replace("media/", "")}`;
        const bCacheKey = `${config.owner}/${config.repoName}/${config.branch}/${b.path.replace("media/", "")}`;

        const aMeta = gitMeta[cacheKey];
        const bMeta = gitMeta[bCacheKey];

        const aDate = isCreated
          ? toTimestamp(a.createdDate || aMeta?.createdDate)
          : toTimestamp(a.commitDate || aMeta?.commitDate);
        const bDate = isCreated
          ? toTimestamp(b.createdDate || bMeta?.createdDate)
          : toTimestamp(b.commitDate || bMeta?.commitDate);

        if (aDate !== bDate) {
          if (aDate == null) return 1;
          if (bDate == null) return -1;
          const diff = aDate - bDate;
          return isDesc ? -diff : diff;
        }
      }
      return a.name.localeCompare(b.name);
    });
  }, [
    filterResult,
    query,
    sortValue,
    gitMeta,
    config.owner,
    config.repoName,
    config.branch,
    toTimestamp,
  ]);

  const totalPage = Math.ceil((sortedFiles?.length || 0) / PAGINATION);
  const currentPage = +page;
  const startIndex = (currentPage - 1) * PAGINATION;
  const endIndex = startIndex + PAGINATION;

  const splicedFiles = useMemo(() => {
    return sortedFiles?.slice(startIndex, endIndex) ?? [];
  }, [sortedFiles, startIndex, endIndex]);

  if (isTreesLoading) {
    return <Loading />;
  }

  return (
    <>
      <MediaManager gitMeta={gitMeta} trees={splicedFiles} />

      {totalPage > 1 && (
        <div className="mt-4">
          <EllipsisPagination
            totalPages={totalPage}
            currentPage={currentPage}
            onPageChange={(page) => {
              const search = new URLSearchParams(searchParams as any);
              search.set("page", String(page));
              redirect(`?${search.toString()}`);
            }}
          />
        </div>
      )}
    </>
  );
}
