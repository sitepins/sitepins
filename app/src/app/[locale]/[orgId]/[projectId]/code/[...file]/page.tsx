"use client";

import { useGitProvider } from "@/hooks/use-git-provider";
import { findFileByPath } from "@/lib/utils/common";
import {
  isGitHubProvider,
  isGitLabProvider,
} from "@/lib/utils/provider-checker";
import { selectConfig } from "@/redux/features/config/slice";
import { useGetGitHubContentQuery } from "@/redux/features/github";
import { useGetGitLabContentQuery } from "@/redux/features/gitlab";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import path from "path";
import { use } from "react";
import { useSelector } from "react-redux";
import DirectoryView from "../../_components/directory-view";
import CodeSkeleton from "./_components/code-skeleton";

const CodeEditor = dynamic(() => import("./_components/code-editor"), {
  ssr: false,
  loading: () => <CodeSkeleton />,
});

export default function CodeEditPage(
  props: PageProps<"/[locale]/[orgId]/[projectId]/code/[...file]">,
) {
  const params = use(props.params);
  const config = useSelector(selectConfig);
  let filePath = decodeURIComponent(params.file.join("/"));

  // Remove 'content/' prefix if present
  if (filePath.startsWith("content/")) {
    filePath = filePath.replace("content/", "");
  }

  const normalize = (p = "") => p.replace(/^\/+|\/+$/g, "");
  const normalizedContentRoot = normalize(config?.content || "src/content");
  const isCodePath = true;

  // If no file extension, treat it as a folder immediately —
  // no need to wait for the tree to decide. DirectoryView manages its own loading.
  if (!path.extname(filePath)) {
    return (
      <DirectoryView
        currentPath={filePath}
        isCodePath={isCodePath}
        params={params}
        normalizedContentRoot={normalizedContentRoot}
      />
    );
  }

  // ---- File path below ----
  return (
    <CodeFilePage
      filePath={filePath}
      params={params}
      config={config}
      normalizedContentRoot={normalizedContentRoot}
    />
  );
}

// Separate component so hooks are always called unconditionally
function CodeFilePage({
  filePath,
  params,
  config,
  normalizedContentRoot,
}: {
  filePath: string;
  params: { file: string[]; orgId: string; projectId: string };
  config: ReturnType<typeof useSelector<any, any>>;
  normalizedContentRoot: string;
}) {
  const tEditorCode = useTranslations("editor.code");
  const { useGitTrees } = useGitProvider();
  const { branch, provider, owner, repoName, token } = config;
  const isConfigReady =
    token && branch && provider && owner && repoName && filePath;

  const { data: treesData, isLoading: isTreesLoading } = useGitTrees(
    isGitLabProvider(provider) ? filePath : "",
    {
      recursive: isGitHubProvider(provider),
      skip: !isConfigReady,
    },
  );

  const {
    data: ghResponse,
    isLoading: isGhLoading,
    isSuccess: isGhSuccess,
    error: ghError,
  } = useGetGitHubContentQuery(
    {
      ref: config.branch,
      owner: config.owner,
      repo: config.repoName,
      path: filePath,
      parser: false,
    },
    {
      skip: !isConfigReady || !isGitHubProvider(config.provider),
    },
  );

  const {
    data: glResponse,
    isLoading: isGlLoading,
    isSuccess: isGlSuccess,
    error: glError,
  } = useGetGitLabContentQuery(
    {
      id: `${config.owner}/${config.repoName}`,
      file_path: filePath,
      ref: config.branch,
      parser: false,
    },
    {
      skip: !isConfigReady || !isGitLabProvider(config.provider),
    },
  );

  const normalize = (p = "") => p.replace(/^\/+|\/+$/g, "");
  const normalizedQueryPath = normalize(filePath);
  const isCodePath = true;

  // While tree loads, check tree to confirm it's a file (not a folder with extension)
  const getFileFromTree = () => {
    if (!treesData?.trees) return null;
    const rootTree = treesData.trees.find((t) => t.name === "root");
    const codeTree = treesData.trees.find((t) => t.name === "code");
    const searchPath = `content/${filePath}`;

    let folder = undefined;

    if (normalizedQueryPath === normalizedContentRoot) {
      folder = rootTree;
    }
    if (!folder && codeTree?.children) {
      folder = findFileByPath(codeTree.children, searchPath);
    }
    if (!folder && rootTree?.children) {
      folder = findFileByPath(rootTree.children, searchPath);
    }
    if (!folder) {
      folder = findFileByPath(treesData.trees, searchPath);
    }
    return folder;
  };

  if (isTreesLoading) {
    return <CodeSkeleton />;
  }

  const fileNode = getFileFromTree();

  // Even with an extension, if node turns out to be a folder, show DirectoryView
  if (fileNode && (!fileNode.isFile || fileNode.children)) {
    return (
      <DirectoryView
        currentPath={filePath}
        isCodePath={isCodePath}
        params={params}
        normalizedContentRoot={normalizedContentRoot}
        treesData={treesData}
      />
    );
  }

  const response = isGitLabProvider(config.provider) ? glResponse : ghResponse;
  const isLoading = isGitLabProvider(config.provider)
    ? isGlLoading
    : isGhLoading;
  const isSuccess = isGitLabProvider(config.provider)
    ? isGlSuccess
    : isGhSuccess;
  const error = isGitLabProvider(config.provider) ? glError : ghError;

  if (isLoading || !isSuccess) {
    return <CodeSkeleton />;
  }

  if (error) {
    return (
      <div className="flex h-full w-full items-center justify-center text-center">
        <div className="text-destructive">
          <h2 className="mb-2 text-lg font-semibold">
            {tEditorCode("error_loading_title")}
          </h2>
          <p>{tEditorCode("error_loading_desc")}</p>
        </div>
      </div>
    );
  }

  return (
    <CodeEditor
      filePath={filePath}
      content={response?.data || ""}
      orgId={params.orgId}
      projectId={params.projectId}
    />
  );
}
