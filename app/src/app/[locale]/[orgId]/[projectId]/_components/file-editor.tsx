import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { ImageProvider } from "@/contexts/image-context";
import { assignUniqueId } from "@/editor/utils/plate-utils";
import { API_URL, SCHEMA_FOLDER } from "@/lib/constant";
import { resolveRepoPath } from "@/lib/utils/common";
import {
  contentFormatter,
  parseContentJson,
} from "@/lib/utils/content-serializer";
import { fmDetector } from "@/lib/utils/frontmatter-detector";
import {
  isGitHubProvider,
  isGitLabProvider,
} from "@/lib/utils/provider-checker";
import {
  convertSchema,
  generateSchemaName,
} from "@/lib/utils/schema-generator";
import { selectConfig } from "@/redux/features/config/slice";
import { useGetGitHubContentQuery } from "@/redux/features/github";
import { useGetGitLabContentQuery } from "@/redux/features/gitlab";
import {
  useDeleteProjectContentMutation,
  useGetProjectContentQuery,
} from "@/redux/features/project-content/project-content-api";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import path from "path";
import { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { io, Socket } from "socket.io-client";
import DraftConflictDialog, { ConflictChoice } from "./draft-conflict-dialog";
import EditorSkeleton from "./editor-skeleton";
import EditorWrapper from "./editor-wrapper";
import { ImagePasteListener } from "./image-paste-listener";

export default function FileEditor() {
  const tEditorMismatch = useTranslations("editor.mismatch");
  const { file, orgId, projectId } = useParams() as {
    file: string[];
    orgId: string;
    projectId: string;
  };
  const orgIdSafe = orgId?.startsWith("org-") ? orgId.slice(4) : orgId;
  const config = useSelector(selectConfig);
  const { branch, provider, owner, repoName, token } = config;
  const filePathString = file.map(decodeURIComponent).join("/");
  const filepath = resolveRepoPath(filePathString, config);

  const { data: draftRecord, isFetching: isDraftFetching } =
    useGetProjectContentQuery(
      { projectId, orgId: orgIdSafe, file: filepath },
      { skip: !projectId || !orgIdSafe || !filepath },
    );

  const [deleteProjectContent] = useDeleteProjectContentMutation();

  const [useInferred, setUseInferred] = useState<boolean | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    let origin = "";
    if (API_URL) {
      try {
        origin = new URL(API_URL).origin;
      } catch {
        origin = API_URL;
      }
    }

    if (!origin) return;

    const s = io(origin, {
      withCredentials: true,
    });

    s.on("connect", () => {
      s.emit("join-editor", {
        org_id: orgIdSafe,
        project_id: projectId,
        file: filepath,
      });
    });

    setSocket(s);

    return () => {
      s.disconnect();
    };
  }, [orgIdSafe, projectId, filepath]);

  const isConfigReady =
    token && branch && provider && owner && repoName && filepath;

  const {
    data: ghResponse,
    isFetching: isGhFetching,
    isSuccess: isGhSuccess,
  } = useGetGitHubContentQuery(
    {
      ref: branch,
      owner: config.owner,
      repo: config.repoName,
      path: filepath,
      parser: true,
    },
    {
      skip: !isConfigReady || !isGitHubProvider(provider),
    },
  );

  const {
    data: glResponse,
    isFetching: isGlFetching,
    isSuccess: isGlSuccess,
  } = useGetGitLabContentQuery(
    {
      id: `${config.owner}/${config.repoName}`,
      file_path: filepath,
      ref: branch,
      parser: true,
    },
    {
      skip: !isConfigReady || !isGitLabProvider(provider),
    },
  );

  const response = isGitLabProvider(provider) ? glResponse : ghResponse;
  const isFetching = isGitLabProvider(provider) ? isGlFetching : isGhFetching;
  const isSuccess = isGitLabProvider(provider) ? isGlSuccess : isGhSuccess;

  const { data, content, fmType, startWith, comments } =
    (response as any) || {};

  // Resolve schema path
  // 1. Try exact match (e.g. blog/nested.json)
  const folderPath = path.dirname(filePathString);
  const generatedSchemaNameStr = generateSchemaName(folderPath, config.content);
  const primarySchemaPath = `${SCHEMA_FOLDER}/${generatedSchemaNameStr}.json`;

  // 2. Try root collection match (e.g. blog.json)
  const rootCollection = generatedSchemaNameStr.split("/")[0];
  const secondarySchemaPath = `${SCHEMA_FOLDER}/${rootCollection}.json`;
  const hasSecondary =
    rootCollection && rootCollection !== generatedSchemaNameStr;

  const {
    data: ghPrimarySchema,
    isFetching: isGhPrimarySchemaFetching,
    isError: isGhPrimarySchemaError,
  } = useGetGitHubContentQuery(
    {
      ref: branch,
      owner: config.owner,
      repo: config.repoName,
      path: primarySchemaPath,
      parser: true,
    },
    {
      skip: !isGitHubProvider(config.provider),
    },
  );

  const {
    data: glPrimarySchema,
    isFetching: isGlPrimarySchemaFetching,
    isError: isGlPrimarySchemaError,
  } = useGetGitLabContentQuery(
    {
      id: `${config.owner}/${config.repoName}`,
      file_path: primarySchemaPath,
      ref: branch,
      parser: true,
    },
    {
      skip: !isGitLabProvider(config.provider),
    },
  );

  const primarySchema = isGitLabProvider(config.provider)
    ? glPrimarySchema
    : ghPrimarySchema;
  const isPrimarySchemaFetching = isGitLabProvider(config.provider)
    ? isGlPrimarySchemaFetching
    : isGhPrimarySchemaFetching;
  const isPrimarySchemaError = isGitLabProvider(config.provider)
    ? isGlPrimarySchemaError
    : isGhPrimarySchemaError;

  const {
    data: ghSecondarySchema,
    isFetching: isGhSecondarySchemaFetching,
    isError: isGhSecondarySchemaError,
  } = useGetGitHubContentQuery(
    {
      ref: branch,
      owner: config.owner,
      repo: config.repoName,
      path: secondarySchemaPath,
      parser: true,
    },
    {
      skip:
        !isGitHubProvider(config.provider) ||
        !hasSecondary ||
        (!!primarySchema && !isPrimarySchemaError),
    },
  );

  const {
    data: glSecondarySchema,
    isFetching: isGlSecondarySchemaFetching,
    isError: isGlSecondarySchemaError,
  } = useGetGitLabContentQuery(
    {
      id: `${config.owner}/${config.repoName}`,
      file_path: secondarySchemaPath,
      ref: branch,
      parser: true,
    },
    {
      skip:
        !isGitLabProvider(config.provider) ||
        !hasSecondary ||
        (!!primarySchema && !isPrimarySchemaError),
    },
  );

  const secondarySchema = isGitLabProvider(config.provider)
    ? glSecondarySchema
    : ghSecondarySchema;
  const isSecondarySchemaFetching = isGitLabProvider(config.provider)
    ? isGlSecondarySchemaFetching
    : isGhSecondarySchemaFetching;
  const isSecondarySchemaError = isGitLabProvider(config.provider)
    ? isGlSecondarySchemaError
    : isGhSecondarySchemaError;

  const hasContent = Boolean(response);
  const fetchingContent = isFetching && !hasContent;

  // Determine if we are still fetching relevant schemas
  // If primary found, we are good. If primary fails, check secondary.
  // If no secondary possible, we are done when primary is done.
  const fetchingSchema =
    isPrimarySchemaFetching || (hasSecondary && isSecondarySchemaFetching);

  // Fallback priority: Primary -> Secondary -> Inferred
  let schemaData = isPrimarySchemaError ? undefined : primarySchema;
  if (!schemaData && hasSecondary && !isSecondarySchemaError) {
    schemaData = secondarySchema;
  }

  const currentGitSha = useMemo(() => {
    const r = response as any;
    const candidates = [
      r?.sha,
      r?.blob_id,
      r?.last_commit_id,
      r?.commit_id,
      r?.data?.sha,
      r?.result?.sha,
    ];

    const firstValid = candidates.find(
      (value) => typeof value === "string" && value.trim().length > 0,
    );

    return (firstValid as string | undefined) ?? null;
  }, [response]);

  const hasValidSavedDraft = useMemo(() => {
    if (!draftRecord) return false;

    const hasId =
      typeof draftRecord._id === "string" && draftRecord._id.length > 0;
    const hasContent = typeof draftRecord.content === "string";
    const matchesFile = draftRecord.file === filepath;

    return hasId && hasContent && matchesFile;
  }, [draftRecord, filepath]);

  // Conflict Choice State
  const [conflictChoice, setConflictChoice] = useState<ConflictChoice | null>(
    null,
  );

  const hasConflict = useMemo(() => {
    const draftGitSha = draftRecord?.git_sha;
    if (!hasValidSavedDraft || !draftGitSha) return false; // legacy draft
    return draftGitSha !== currentGitSha;
  }, [hasValidSavedDraft, draftRecord, currentGitSha]);

  // Which source to load: 'draft', 'git', or null (waiting for choice)
  const activeSource = useMemo(() => {
    if (!hasValidSavedDraft) return "git";
    if (hasConflict) {
      if (conflictChoice === null) return null;
      return conflictChoice === "use-draft" ? "draft" : "git";
    }
    return "draft";
  }, [hasValidSavedDraft, hasConflict, conflictChoice]);

  const parsedDraft = useMemo(() => {
    if (activeSource !== "draft" || !draftRecord?.content) return null;
    try {
      const ext = path.parse(filepath).ext;
      const fm = fmDetector(draftRecord.content, ext);
      const parsed = parseContentJson(draftRecord.content, fm);
      let startWith = "---";
      if (draftRecord.content.startsWith("+++")) {
        startWith = "+++";
      } else if (draftRecord.content.startsWith("---toml")) {
        startWith = "---toml";
      }
      return {
        ...parsed,
        fmType: fm,
        startWith,
      };
    } catch (err) {
      console.error("Failed to parse draft content:", err);
      return null;
    }
  }, [activeSource, draftRecord?.content, filepath]);

  const gitPreviewContent = useMemo(() => {
    if (!data && !content) return "";

    if (!fmType) {
      return content ?? "";
    }

    try {
      return contentFormatter({
        data: data ?? {},
        page_content: content ?? "",
        format: fmType,
        startWith,
        originalContent: "",
      });
    } catch {
      return content ?? "";
    }
  }, [data, content, fmType, startWith]);

  const finalData =
    activeSource === "draft" && parsedDraft ? parsedDraft.data : data;
  const finalContent =
    activeSource === "draft" && parsedDraft
      ? parsedDraft.content
      : (content ?? "");
  const finalFmType =
    activeSource === "draft" && parsedDraft ? parsedDraft.fmType : fmType;
  const finalStartWith =
    activeSource === "draft" && parsedDraft ? parsedDraft.startWith : startWith;
  const finalComments =
    activeSource === "draft" && parsedDraft ? parsedDraft.comments : comments;

  const isMismatched = useMemo(() => {
    if (!finalData || !schemaData?.data?.template) return false;
    const dataKeys = Object.keys(finalData);
    const schemaFieldNames = schemaData.data.template.map((f: any) => f.name);

    // Check if any data key is missing from schema
    const hasMissingInSchema = dataKeys.some(
      (key) => key !== "content" && !schemaFieldNames.includes(key),
    );
    // Check if any schema field is missing from data
    const hasMissingInData = schemaFieldNames.some(
      (name: string) => !dataKeys.includes(name),
    );

    return hasMissingInSchema || hasMissingInData;
  }, [finalData, schemaData]);

  if (!isSuccess || fetchingContent || fetchingSchema || isDraftFetching) {
    return <EditorSkeleton />;
  }

  if (activeSource === null) {
    return (
      <>
        <EditorSkeleton />
        <DraftConflictDialog
          open={true}
          draftSavedAt={draftRecord?.updatedAt}
          gitContent={gitPreviewContent}
          draftContent={draftRecord?.content ?? ""}
          onChoose={async (choice) => {
            setConflictChoice(choice);
            if (choice === "use-git") {
              try {
                await deleteProjectContent({
                  projectId,
                  orgId: orgIdSafe,
                  file: filepath,
                }).unwrap();
              } catch (err) {
                console.error("Failed to delete draft:", err);
              }
            }
          }}
        />
      </>
    );
  }

  const inferredTemplate = convertSchema(finalData, finalComments);
  const schemaTemplate = schemaData?.data?.template || inferredTemplate;

  const finalTemplate = useInferred ? inferredTemplate : schemaTemplate;
  const gitShaForWrapper: string | undefined =
    currentGitSha === null ? undefined : currentGitSha;

  return (
    <ImageProvider>
      <ImagePasteListener />

      <AlertDialog open={isMismatched && useInferred === null}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tEditorMismatch("title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {tEditorMismatch("description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setUseInferred(true)}>
              {tEditorMismatch("show_actual")}
            </Button>
            <AlertDialogAction onClick={() => setUseInferred(false)}>
              {tEditorMismatch("show_schema")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <EditorWrapper
        socket={socket}
        key={
          useInferred === null
            ? `initial-${activeSource}`
            : useInferred
              ? `inferred-${activeSource}`
              : `schema-${activeSource}`
        }
        filePath={filepath}
        content={finalContent}
        data={assignUniqueId(finalData)}
        schema={finalTemplate}
        fmType={finalFmType}
        startWith={finalStartWith}
        gitSha={gitShaForWrapper}
        isLoadedFromDbDraft={activeSource === "draft"}
        hasSavedDraft={hasValidSavedDraft}
      />
    </ImageProvider>
  );
}
