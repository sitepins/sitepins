"use client";

import SnippetForm from "@/app/[locale]/[orgId]/[projectId]/settings/snippets/_components/snippet-form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SCHEMA_FOLDER } from "@/lib/constant";
import {
  isGitHubProvider,
  isGitLabProvider,
} from "@/lib/utils/provider-checker";
import { selectConfig } from "@/redux/features/config/slice";
import { githubContentApi } from "@/redux/features/github";
import { gitlabApi } from "@/redux/features/gitlab";
import { useAppDispatch } from "@/redux/store";
import { useEffect, useState } from "react";
import { useSelector } from "react-redux";

type SchemaFile = {
  name: string;
  path: string;
};

type SnippetSaveDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  code: string;
  onSuccess: () => void;
};

export function SnippetSaveDialog({
  open,
  onOpenChange,
  code,
  onSuccess,
}: SnippetSaveDialogProps) {
  const config = useSelector(selectConfig);
  const dispatch = useAppDispatch();
  const [schemas, setSchemas] = useState<SchemaFile[]>([]);

  useEffect(() => {
    if (open) {
      const fetchSchemas = async () => {
        if (
          !config.owner ||
          !config.branch ||
          (isGitHubProvider(config.provider) && !config.repoName)
        )
          return;

        try {
          // Get tree to find schema files
          const treeResult = isGitLabProvider(config.provider)
            ? await dispatch(
                // @ts-ignore
                gitlabApi.endpoints.getRepositoryTree.initiate(
                  {
                    projectId: config.repoName
                      ? `${config.owner}/${config.repoName}`
                      : config.owner,
                    ref: config.branch,
                    recursive: true,
                  },
                  { forceRefetch: false },
                ),
              ).unwrap()
            : await dispatch(
                // @ts-ignore
                githubContentApi.endpoints.getGitHubTrees.initiate(
                  {
                    owner: config.owner,
                    repo: config.repoName,
                    tree_sha: config.branch,
                    recursive: "1",
                    config: config,
                  },
                  { forceRefetch: false },
                ),
              ).unwrap();

          const treeItems =
            (treeResult &&
              ((treeResult as any).files || (treeResult as any).tree)) ||
            [];
          const schemaFiles = treeItems.filter(
            (item: any) =>
              item.type === "blob" &&
              item.path &&
              item.path.startsWith(SCHEMA_FOLDER + "/") &&
              item.path.endsWith(".json"),
          );

          // Fetch content for each schema
          const filePromises = schemaFiles.map(async (file: any) => {
            try {
              // @ts-ignore
              const content = isGitLabProvider(config.provider)
                ? await dispatch(
                    // @ts-ignore
                    gitlabApi.endpoints.getGitLabContent.initiate(
                      {
                        id: config.repoName
                          ? `${config.owner}/${config.repoName}`
                          : config.owner,
                        file_path: file.path,
                        ref: config.branch,
                      },
                      { forceRefetch: false },
                    ),
                  ).unwrap()
                : await dispatch(
                    // @ts-ignore
                    githubContentApi.endpoints.getGitHubContent.initiate(
                      {
                        owner: config.owner,
                        repo: config.repoName,
                        path: file.path,
                        ref: config.branch,
                        parser: true,
                      },
                      { forceRefetch: false },
                    ),
                  ).unwrap();

              const fileName =
                file.path.split("/").pop()?.replace(".json", "") || "";
              return {
                name: fileName,
                path: file.path,
              };
            } catch (e) {
              return null;
            }
          });

          const results = await Promise.all(filePromises);
          const filtered = results.filter(
            (r: SchemaFile | null): r is SchemaFile => r !== null,
          );
          setSchemas(filtered);
        } catch (error) {
          console.error("Error loading schemas:", error);
        }
      };

      fetchSchemas();
    }
  }, [open, config.owner, config.repoName, config.branch, dispatch, config]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] w-full overflow-y-auto sm:max-w-175">
        <DialogHeader>
          <DialogTitle>Save as Snippet</DialogTitle>
          <DialogDescription>
            Save this code block as a reusable snippet.
          </DialogDescription>
        </DialogHeader>

        <SnippetForm
          snippet={null} // null means create new
          schemas={schemas}
          onSuccess={onSuccess}
          defaultCode={code}
        />
      </DialogContent>
    </Dialog>
  );
}
