"use client";

import { Card, CardContent } from "@/components/ui/card";
import { ImageProvider } from "@/contexts/image-context";
import { assignUniqueId } from "@/editor/utils/plate-utils";
import { useGitProvider } from "@/hooks/use-git-provider";
import { format } from "@/lib/utils/content-serializer";
import { convertSchema } from "@/lib/utils/schema-generator";
import { selectConfig } from "@/redux/features/config/slice";
import { TFrontmatterData } from "@/types";
import { Folder } from "lucide-react";
import { useTranslations } from "next-intl";
import { use } from "react";
import { useSelector } from "react-redux";
import EditorWrapper from "../../_components/editor-wrapper";
import { ImagePasteListener } from "../../_components/image-paste-listener";
import { ConfigSkeleton } from "./_components/config-skeleton";

export default function Configuration(
  props: PageProps<"/[locale]/[orgId]/[projectId]/config/[...path]">,
) {
  const tConfigEmpty = useTranslations("project.config_empty");
  const params = use(props.params);
  const { path: file } = params;

  const config = useSelector(selectConfig);
  const { branch, provider, owner, repoName, token } = config;
  const filepath = decodeURIComponent(file?.join("/"));

  const isConfigReady = token && branch && provider && owner && repoName;

  const { useGitContent } = useGitProvider();

  const {
    data: response,
    isLoading,
    isSuccess,
  } = useGitContent(filepath, {
    parser: true,
    skip: !isConfigReady,
  });

  if (isLoading || !isSuccess) {
    return <ConfigSkeleton />;
  }

  const { data, content, fmType, comments } =
    (response as {
      data?: TFrontmatterData;
      content?: string;
      fmType?: format;
      comments?: Record<string, string>;
    }) || {};
  const template = convertSchema(data ?? {}, comments);

  if (template.length === 0) {
    return (
      <div className="flex h-[calc(100svh-64px)] flex-col items-center justify-center space-y-4 p-8 text-center">
        <Card>
          <CardContent className="text-center">
            <div className="bg-muted/50 mx-auto flex size-14 items-center justify-center rounded-2xl">
              <Folder className="size-7" />
            </div>

            <h2 className="text-center text-xl font-medium">
              {tConfigEmpty("title")}
            </h2>
            <p className="text-text-strong max-w-md">
              {tConfigEmpty("description")}
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
          fmType={fmType as format}
        />
      </ImageProvider>
    </div>
  );
}
