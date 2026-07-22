"use client";

import Container from "@/components/container";
import EllipsisPagination from "@/components/ellipsis-pagination";
import Search from "@/components/search";
import { SelectItem } from "@/components/ui/select";
import { useGitProvider } from "@/hooks/use-git-provider";
import config from "@/lib/config";
import { SCHEMA_FOLDER } from "@/lib/constant";
import { cn } from "@/lib/utils/cn";
import { findFileByPath, mergePatterns } from "@/lib/utils/common";
import { sorts } from "@/lib/utils/filter-options";
import {
  isGitHubProvider,
  isGitLabProvider,
} from "@/lib/utils/provider-checker";
import { generateSchemaName } from "@/lib/utils/schema-generator";
import { slugify } from "@/lib/utils/text-converter";
import { selectFileMetadata } from "@/redux/features/config/meta-slice";
import { selectConfig } from "@/redux/features/config/slice";
import { githubContentApi } from "@/redux/features/github";
import { gitlabContentApi } from "@/redux/features/gitlab";
import { store } from "@/redux/store";
import { TFiles } from "@/types";
import { Folder } from "lucide-react";
import micromatch from "micromatch";
import { useTranslations } from "next-intl";
import { redirect, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { useSelector } from "react-redux";
import AddFile from "./add-file";
import CodeFileRow from "./code-file-row";
import DirectorySkeleton from "./directory-skeleton";
import FileRow from "./file-row";
import { DEFAULT_SORT, SortSelect } from "./sort-select";

const PAGINATION = config.pagination.file_limit;
const allowExtensions = config.allowExtensions;

type Props = {
  currentPath: string; // The resolved path in the repo (e.g. "src/content/blog" or "")
  isCodePath: boolean;
  params: {
    file: string[];
    orgId: string;
    projectId: string;
  };
  normalizedContentRoot?: string;
  treesData?: { trees: TFiles[] } | null; // optional pre-fetched tree data
};

export default function DirectoryView({
  currentPath,
  isCodePath,
  params,
  normalizedContentRoot,
  treesData: externalTreesData,
}: Props) {
  const tDirectoryView = useTranslations("directory-view");
  const searchParams = useSearchParams();
  const config = useSelector(selectConfig);
  const gitMeta = useSelector(selectFileMetadata);
  const sortValue = searchParams.get("sort") || DEFAULT_SORT;

  // Derive simple name from the file array or path
  const name = params.file?.[params.file.length - 1] || "";

  const fileArrangementMap = useMemo(() => {
    const entries = new Map<string, string>();
    (config.arrangement ?? [])
      .filter((arrangement: any) => arrangement.type === "file")
      .forEach((arrangement: any) => {
        entries.set(arrangement.targetPath, arrangement.groupName);
      });
    return entries;
  }, [config.arrangement]);

  const matchedArrangement = (config.arrangement ?? []).find(
    (arrangement: any) =>
      slugify(arrangement.groupName) === slugify(name) &&
      arrangement.type === "folder",
  );

  const normalize = (p = "") => p.replace(/^\/+|\/+$/g, "");
  const normalizedQueryPath = normalize(currentPath);
  const _normalizedContentRoot = normalize(
    normalizedContentRoot || config?.content || "src/content",
  );

  // Schema logic for AddFile. Keyed by raw URL slug, not resolved repo path.
  const schemaPath =
    SCHEMA_FOLDER +
    "/" +
    generateSchemaName(params.file?.join("/") || "", config.content) +
    ".json";

  const { useGitTrees, useGitContent, provider } = useGitProvider();

  // Fetch schema only if useful (mainly for AddFile)
  const isSingleFile = false; // DirectoryView implies it's a directory
  useGitContent(schemaPath, {
    parser: true,
    skip: isCodePath || isSingleFile,
  });

  // Fetch folder content when sorting by date to enrich metadata cache
  const isDateSort =
    sortValue.includes("created") || sortValue.includes("updated");

  useGitContent(currentPath, {
    skip:
      isSingleFile ||
      !isDateSort ||
      (isGitLabProvider(provider) && !isSingleFile),
  });

  const {
    data: internalTreesData,
    isLoading: isTreesLoading,
    isSuccess,
  } = useGitTrees(isGitLabProvider(provider) ? currentPath : "", {
    recursive: isGitHubProvider(provider),
    skip: isSingleFile || !!externalTreesData,
  });

  // Use externally provided treesData if available (avoids a second fetch)
  const treesData = externalTreesData ?? internalTreesData;

  const getFilesFromTree = () => {
    if (!treesData?.trees) return [];

    const rootTree = treesData.trees.find((t) => t.name === "root");
    const codeTree = treesData.trees.find((t) => t.name === "code");

    // Construct the path to search for
    const searchPath = `content/${currentPath}`;

    let folder: TFiles | undefined;

    if (normalizedQueryPath === _normalizedContentRoot) {
      folder = rootTree;
    }

    if (!folder && isCodePath && codeTree?.children) {
      folder = findFileByPath(codeTree.children, searchPath);
    }

    if (!folder && rootTree?.children) {
      folder = findFileByPath(rootTree.children, searchPath);
    }

    if (!folder) {
      folder = findFileByPath(treesData.trees, searchPath);
    }

    return (folder?.children || []).map((f) => ({
      ...f,
      type: f.isFile ? "file" : "dir",
    }));
  };

  const files = getFilesFromTree() as TFiles[];
  const isFilesLoading = externalTreesData
    ? false
    : isTreesLoading || !isSuccess;

  if (isFilesLoading) {
    return <DirectorySkeleton isCodePath={isCodePath} />;
  }

  if (!isFilesLoading && !treesData?.trees) {
    return (
      <div className="flex h-full flex-col items-center justify-center space-y-4 p-8 text-center">
        <div className="bg-card rounded-lg border p-6">
          <h2 className="text-destructive mb-2 text-xl font-semibold">
            {tDirectoryView("not_found.title")}
          </h2>
          <p className="text-muted-foreground max-w-md">
            {tDirectoryView("not_found.description", { path: currentPath })}
          </p>
          <p className="text-muted-foreground mt-2 text-sm">
            {tDirectoryView("not_found.help")}
          </p>
        </div>
      </div>
    );
  }

  const include =
    matchedArrangement?.type === "folder"
      ? matchedArrangement?.include
      : undefined;
  const exclude =
    matchedArrangement?.type === "folder"
      ? (matchedArrangement?.exclude ?? [])
      : undefined;

  const { patterns, includes, excludes } = mergePatterns({
    include,
    exclude,
  });

  const currentPage = +(searchParams.get("page") || 1);
  const startIndex = (currentPage - 1) * PAGINATION;
  const endIndex = startIndex + PAGINATION;

  let filterResult = files?.filter((file) => {
    const isFile = file.type === "file";
    if (patterns?.length && isFile) {
      return micromatch.isMatch(file.path, includes, {
        ignore: excludes,
        matchBase: true,
      });
    } else if (isFile) {
      if (isCodePath) {
        return true;
      } else {
        const ext = file.path.includes(".")
          ? `.${file.path.split(".").pop()}`
          : "";
        return allowExtensions.includes(ext);
      }
    } else {
      return false;
    }
  });

  const query = searchParams.get("q")?.toLowerCase();
  if (query) {
    filterResult = filterResult?.filter((item) => {
      const fileName = item.name.toLowerCase();
      const filePath = item.path.toLowerCase();

      if (fileName.includes(query) || filePath.includes(query)) {
        return true;
      }

      const select = isGitLabProvider(config.provider)
        ? gitlabContentApi.endpoints.getGitLabContent.select({
            id: config.repoName,
            file_path: item.path.replace("content/", ""),
            ref: config.branch,
            parser: true,
          })
        : githubContentApi.endpoints.getGitHubContent.select({
            owner: config.owner,
            path: item.path.replace("content/", ""),
            ref: config.branch,
            repo: config.repoName,
            parser: true,
          });
      const { data } = select(store.getState()) || {};

      const title = (data as any)?.title || (data as any)?.data?.title;
      return title?.toLowerCase()?.includes(query);
    });
  }

  const filteredFiles = filterResult ?? [];

  const sortDefinition =
    sorts.find((definition) => definition.value === sortValue) ??
    sorts.find((definition) => definition.value === DEFAULT_SORT)!;

  const normalizeTitle = (file: TFiles) => {
    const normalizedPath = file.path.replace(/^content\//, "");
    if (!isCodePath) {
      const arrangedTitle = fileArrangementMap.get(normalizedPath);
      if (arrangedTitle) {
        return arrangedTitle;
      }
    }

    const parsedName = file.name.includes(".")
      ? file.name.substring(0, file.name.lastIndexOf("."))
      : file.name;
    return parsedName || file.name;
  };

  const toTimestamp = (value?: string) => {
    if (!value) return undefined;
    const timestamp = Date.parse(value);
    return Number.isNaN(timestamp) ? undefined : timestamp;
  };

  const sortedFiles =
    filteredFiles.length > 0
      ? [...filteredFiles].sort((a, b) => {
          if (sortDefinition.field === "title") {
            const comparison = normalizeTitle(a).localeCompare(
              normalizeTitle(b),
              undefined,
              { sensitivity: "base", numeric: true },
            );

            if (comparison !== 0) {
              return sortDefinition.direction === "asc"
                ? comparison
                : -comparison;
            }
          } else {
            const cacheKey = `${config.owner}/${config.repoName}/${config.branch}/${a.path.replace("content/", "")}`;
            const bCacheKey = `${config.owner}/${config.repoName}/${config.branch}/${b.path.replace("content/", "")}`;

            const aMeta = gitMeta[cacheKey];
            const bMeta = gitMeta[bCacheKey];

            const aDate =
              sortDefinition.field === "created"
                ? toTimestamp(a.createdDate || aMeta?.createdDate)
                : toTimestamp(a.commitDate || aMeta?.commitDate);
            const bDate =
              sortDefinition.field === "created"
                ? toTimestamp(b.createdDate || bMeta?.createdDate)
                : toTimestamp(b.commitDate || bMeta?.commitDate);

            if (aDate !== bDate) {
              if (aDate == null) return 1;
              if (bDate == null) return -1;
              const diff = aDate - bDate;
              if (diff !== 0) {
                return sortDefinition.direction === "asc" ? diff : -diff;
              }
            }
          }

          return a.name.localeCompare(b.name);
        })
      : filteredFiles;

  const totalPage = Math.ceil((sortedFiles.length || 0) / PAGINATION);
  const paginatedFiles = sortedFiles.slice(startIndex, endIndex);

  return (
    <Container fullWidth className="space-y-0">
      <div className="flex flex-col gap-y-3 md:flex-row md:items-center md:space-x-2">
        <Search className="flex-1" />
        <div className="flex w-full items-center gap-x-2 md:w-auto">
          <SortSelect
            isCodePath={isCodePath}
            className="flex-1 data-[size=default]:h-10 md:w-50"
          />
          {!isCodePath && (
            <AddFile
              schemaDir={schemaPath}
              targetPath={params.orgId + "/" + params.projectId}
              folderName={name}
              filePath={params.file?.join("/") || ""}
              group={searchParams.get("group") || ""}
              size={"lg"}
              className="h-10"
            >
              {sortedFiles.map((item) => (
                <SelectItem
                  key={item.path}
                  value={item.path.replace("content/", "")}
                >
                  {item.name}
                </SelectItem>
              ))}
            </AddFile>
          )}
        </div>
      </div>
      <div className="mt-4 flex-1">
        <div
          className={cn(
            "space-y-4",
            !sortedFiles.length && "h-full max-h-[calc(100%-64px)]",
          )}
        >
          {sortedFiles.length > 0 && (
            <div className="border-border bg-light text-text-dark hidden grid-cols-12 rounded-lg border px-6 py-2.5 font-semibold md:grid 2xl:px-8">
              {isCodePath ? (
                <>
                  <div className="text-h6 text-primary col-span-5 flex">
                    {tDirectoryView("headers.file_name")}
                  </div>
                  <div className="text-h6 text-primary col-span-3 text-left">
                    {tDirectoryView("headers.size")}
                  </div>
                  <div className="text-h6 text-primary col-span-3 text-left">
                    {tDirectoryView("headers.last_modified")}
                  </div>
                  <div className="text-h6 text-primary col-span-1 text-center"></div>
                </>
              ) : (
                <>
                  <div className="text-h6 text-primary col-span-4 flex">
                    {tDirectoryView("headers.title")}
                  </div>
                  <div className="text-h6 text-primary col-span-2 text-left">
                    {tDirectoryView("headers.slug")}
                  </div>
                  <div className="text-h6 text-primary col-span-4 text-center">
                    {tDirectoryView("headers.last_update")}
                  </div>
                  <div className="text-h6 text-primary col-span-1 text-left">
                    {tDirectoryView("headers.status")}
                  </div>
                  <div className="text-h6 text-primary col-span-1 text-left"></div>
                </>
              )}
            </div>
          )}

          <div className="md:[&>*:not(:last-child)]:border-border border-border h-full rounded-lg md:border [&>*:not(:last-child)]:mb-4 md:[&>*:not(:last-child)]:mb-0 md:[&>*:not(:last-child)]:border-b">
            {sortedFiles.length > 0 ? (
              paginatedFiles.map((file) =>
                isCodePath ? (
                  <CodeFileRow key={file.path} file={file} />
                ) : (
                  <FileRow key={file.path} file={file} />
                ),
              )
            ) : (
              <div className="col-span-12 flex h-full flex-col items-center justify-center space-y-4 py-8 text-center">
                <div className="bg-muted/50 flex size-14 items-center justify-center rounded-2xl">
                  <Folder className="size-7" />
                </div>
                <h2 className="text-center text-xl font-medium">
                  {tDirectoryView("empty")}
                </h2>
              </div>
            )}
          </div>
        </div>
      </div>
      {totalPage > 1 && (
        <div className="mt-5">
          <EllipsisPagination
            totalPages={totalPage}
            currentPage={currentPage}
            onPageChange={(page) => {
              const search = new URLSearchParams(searchParams);
              search.set("page", String(page));
              redirect(`?${search.toString()}`);
            }}
          />
        </div>
      )}
    </Container>
  );
}
