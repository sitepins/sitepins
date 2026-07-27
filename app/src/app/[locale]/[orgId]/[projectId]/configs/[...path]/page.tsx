"use client";

import { Card, CardContent } from "@/components/ui/card";
import { ImageProvider } from "@/contexts/image-context";
import { assignUniqueId } from "@/editor/utils/plate-utils";
import {
  isGitHubProvider,
  isGitLabProvider,
} from "@/lib/utils/provider-checker";
import { convertSchema } from "@/lib/utils/schema-generator";
import { selectConfig } from "@/redux/features/config/slice";
import { useGetGitHubContentQuery } from "@/redux/features/github";
import { useGetGitLabContentQuery } from "@/redux/features/gitlab";
import { Folder } from "lucide-react";
import { use } from "react";
import { useSelector } from "react-redux";
import EditorWrapper from "../../_components/editor-wrapper";
import { ImagePasteListener } from "../../_components/image-paste-listener";
import { ConfigsSkeleton } from "./_components/configs-skeleton";

export default function Configuration(
  props: PageProps<"/[locale]/[orgId]/[projectId]/configs/[...path]">,
) {
  const params = use(props.params);
  const { path: file } = params;

  const config = useSelector(selectConfig);
  const { branch, provider, owner, repoName, token } = config;
  const filepath = decodeURIComponent(file?.join("/"));

  const isConfigReady = token && branch && provider && owner && repoName;

  const {
    data: ghResponse,
    isLoading: isGhLoading,
    isSuccess: isGhSuccess,
    error: ghError,
  } = useGetGitHubContentQuery(
    {
      ref: branch,
      owner,
      repo: repoName,
      path: filepath,
      parser: true,
    },
    {
      skip: !isConfigReady || !isGitHubProvider(provider),
    },
  );

  const {
    data: glResponse,
    isLoading: isGlLoading,
    isSuccess: isGlSuccess,
    error: glError,
  } = useGetGitLabContentQuery(
    {
      id: `${owner}/${repoName}`,
      file_path: filepath,
      ref: branch,
      parser: true,
    },
    {
      skip: !isConfigReady || !isGitLabProvider(provider),
    },
  );

  const response = isGitLabProvider(provider) ? glResponse : ghResponse;
  const isLoading = isGitLabProvider(provider) ? isGlLoading : isGhLoading;
  const isSuccess = isGitLabProvider(provider) ? isGlSuccess : isGhSuccess;

  if (isLoading || !isSuccess) {
    return <ConfigsSkeleton />;
  }

  const { data, content, fmType, comments } = (response as any) || {};
  const template = convertSchema(data, comments);

  if (template.length === 0) {
    return (
      <div className="flex h-[calc(100svh-64px)] flex-col items-center justify-center space-y-4 p-8 text-center">
        <Card>
          <CardContent className="text-center">
            <div className="bg-muted/50 mx-auto flex size-14 items-center justify-center rounded-2xl">
              <Folder className="size-7" />
            </div>

            <h2 className="text-center text-xl font-medium">
              Nothing to see here
            </h2>
            <p className="text-text-dark max-w-md">
              There is no configuration available for this content. Please
              create a schema first to configure this content.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="pb-10">
      <ImageProvider>
        <ImagePasteListener />
        <EditorWrapper
          shouldShowEditor={false}
          filePath={filepath}
          content={content ?? ""}
          data={assignUniqueId(data)}
          // @ts-ignore
          schema={template}
          fmType={fmType}
        />
      </ImageProvider>
    </div>
  );
}
