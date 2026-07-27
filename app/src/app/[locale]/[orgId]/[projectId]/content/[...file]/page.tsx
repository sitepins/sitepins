"use client";

import config from "@/lib/config";
import { resolveRepoPath } from "@/lib/utils/common";
import { selectConfig } from "@/redux/features/config/slice";
import dynamic from "next/dynamic";
import { use } from "react";
import { useSelector } from "react-redux";
import DirectoryView from "../../_components/directory-view";
import EditorSkeleton from "../../_components/editor-skeleton";

const allowExtensions = config.allowExtensions;

type Props = {
  params: Promise<{
    file: string[];
    user: string;
    repo: string;
    branch: string;
    orgId: string;
    projectId: string;
  }>;
};

const DynamicFileEditor = dynamic(
  () => import("../../_components/file-editor"),
  {
    loading: () => {
      return <EditorSkeleton />;
    },
  },
);

export default function Page(props: Props) {
  let file = use(props.params)
    .file.join("/")
    .replaceAll("%5B", "[")
    .replaceAll("%5D", "]");
  try {
    // decode any URL-encoded segments (spaces -> %20, etc.)
    file = decodeURIComponent(file);
  } catch (e) {
    // ignore decode errors and keep original
  }
  const params = use(props.params);
  const extensionStr = file.includes(".") ? `.${file.split(".").pop()}` : "";
  const extension = extensionStr;
  const isSingleFile = Boolean(
    extension && allowExtensions.includes(extension),
  );

  const config = useSelector(selectConfig);

  let queryPath = resolveRepoPath(file, config);

  const normalize = (p = "") => p.replace(/^\/+|\/+$/g, "");
  const normalizedQueryPath = normalize(queryPath);
  const normalizedContentRoot = normalize(config?.content || "src/content");

  // Check if it's a content path more reliably
  const isContentPath =
    normalizedContentRoot &&
    (normalizedQueryPath === normalizedContentRoot ||
      normalizedQueryPath.startsWith(normalizedContentRoot + "/"));

  // Fallback check: if the path starts with content/, it's likely a content path
  // even if it doesn't match the normalizedContentRoot exactly (e.g. if root is "content")
  const looksLikeContent =
    normalizedQueryPath === "content" ||
    normalizedQueryPath.startsWith("content/");

  const finalIsContentPath = isContentPath || looksLikeContent;

  const isCodePath = !finalIsContentPath;

  // Handle content file editing only - early return after all hooks
  if (isSingleFile) {
    return <DynamicFileEditor />;
  }

  return (
    <DirectoryView
      currentPath={queryPath}
      isCodePath={isCodePath}
      params={params}
      normalizedContentRoot={normalizedContentRoot}
    />
  );
}
