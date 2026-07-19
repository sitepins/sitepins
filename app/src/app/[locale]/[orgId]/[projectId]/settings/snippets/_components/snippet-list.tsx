"use client";

import { UpgradeCta } from "@/components/upgrade-cta";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useOwnerPlan } from "@/hooks/use-owner-plan";
import { SCHEMA_FOLDER, SNIPPET_FOLDER } from "@/lib/constant";
import {
  isGitHubProvider,
  isGitLabProvider,
} from "@/lib/utils/provider-checker";
import { snippetSchema } from "@/lib/validate";
import { selectConfig } from "@/redux/features/config/slice";
import { githubContentApi } from "@/redux/features/github";
import { gitlabApi } from "@/redux/features/gitlab";
import { useAppDispatch } from "@/redux/store";
import { Code, Plus, Settings } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSelector } from "react-redux";
import * as z from "zod/v4";
import SnippetForm from "./snippet-form";
import { SnippetSkeleton } from "./snippet-skeleton";

type SnippetFile = {
  name: string; // filename without extension
  path: string; // full path including .sitepins/snippet/
  data?: z.infer<typeof snippetSchema>;
};

type SchemaFile = {
  name: string;
  path: string;
};

const SnippetList = () => {
  const { canAccessPremiumFeatures, isLoading } = useOwnerPlan();
  const config = useSelector(selectConfig);
  const dispatch = useAppDispatch();
  const tProjectSettingsSnippets = useTranslations("project-settings.snippets");
  const tCommon = useTranslations("common");

  const [snippets, setSnippets] = useState<SnippetFile[]>([]);
  const [schemas, setSchemas] = useState<SchemaFile[]>([]);
  const [isLoadingSnippets, setIsLoadingSnippets] = useState(true);
  const [selectedSnippet, setSelectedSnippet] = useState<SnippetFile | null>(
    null,
  );
  const [modalOpen, setModalOpen] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoadingSnippets(true);

    if (
      !config.owner ||
      !config.branch ||
      !config.token ||
      (isGitHubProvider(config.provider) && !config.repoName)
    ) {
      return;
    }

    try {
      // First, get the tree to find files
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

      const findFiles = (folder: string, extension: string) =>
        treeItems.filter(
          (item: any) =>
            item.type === "blob" &&
            item.path &&
            item.path.startsWith(folder + "/") &&
            item.path.endsWith(extension),
        );

      const snippetFiles = findFiles(SNIPPET_FOLDER, ".json");
      const schemaFiles = findFiles(SCHEMA_FOLDER, ".json");

      const fetchContentFor = async (files: any[]) => {
        const filePromises = files.map(async (file: any) => {
          try {
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
              data: content?.data || content,
            };
          } catch (e) {
            console.error(`Failed to load ${file.path}:`, e);
            return null;
          }
        });

        const results = await Promise.all(filePromises);
        const filtered = results.filter(
          (r): r is { name: string; path: string; data: any } => r !== null,
        );
        return filtered;
      };

      const [fetchedSnippets, fetchedSchemas] = await Promise.all([
        fetchContentFor(snippetFiles),
        fetchContentFor(schemaFiles),
      ]);

      setSnippets(fetchedSnippets as SnippetFile[]);
      setSchemas(fetchedSchemas as SchemaFile[]);
    } catch (error) {
      console.error("Error loading snippet data:", error);
      setSnippets([]);
      setSchemas([]);
    } finally {
      setIsLoadingSnippets(false);
    }
  }, [dispatch, config]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleEditSnippet = (snippet: SnippetFile) => {
    setSelectedSnippet(snippet);
    setModalOpen(true);
  };

  const handleCreateSnippet = () => {
    setSelectedSnippet(null);
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setSelectedSnippet(null);
  };

  const isConfigReady = Boolean(
    config.owner &&
    config.branch &&
    config.token &&
    (!isGitHubProvider(config.provider) || config.repoName),
  );

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="space-y-3">
                <CardTitle>{tProjectSettingsSnippets("title")}</CardTitle>
                <CardDescription>
                  {tProjectSettingsSnippets("description")}
                </CardDescription>
              </div>
            </div>
            {isLoading || !isConfigReady ? (
              <Skeleton className="hidden h-9 w-36 md:block" />
            ) : canAccessPremiumFeatures ? (
              <Button className="hidden md:flex" onClick={handleCreateSnippet}>
                <Plus className="mr-2 size-4" />
                {tCommon("actions.add")}
              </Button>
            ) : (
              <UpgradeCta
                labelKey="snippets_add"
                className="hidden h-9 px-4 md:flex"
              />
            )}
          </div>
        </CardHeader>

        <CardContent>
          {isLoading || isLoadingSnippets || !isConfigReady ? (
            <SnippetSkeleton />
          ) : snippets.length === 0 ? (
            <div className="text-muted-foreground py-8 text-center">
              <Code className="mx-auto mb-3 size-12 opacity-20" />
              <p className="text-sm">
                {tProjectSettingsSnippets("no_snippets_found")}
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                {tProjectSettingsSnippets("create_first_snippet")}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {snippets.map((snippet) => (
                <div
                  key={snippet.path}
                  className="border-border flex items-center justify-between gap-4 rounded-lg border p-4 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Code className="text-accent size-4 shrink-0" />
                      <h3 className="truncate text-sm font-medium">
                        {snippet.data?.label || snippet.name}
                      </h3>
                      <span className="text-muted-foreground truncate text-xs">
                        ({snippet.name})
                      </span>
                    </div>
                    <div className="text-muted-foreground mt-1 truncate text-xs">
                      {snippet.data?.schema?.length
                        ? tProjectSettingsSnippets("used_in", {
                            schemas: snippet.data.schema.join(", "),
                          })
                        : tProjectSettingsSnippets("no_schemas_linked")}
                    </div>
                  </div>
                  <Button
                    onClick={() => handleEditSnippet(snippet)}
                    size="sm"
                    variant="outline"
                  >
                    <Settings className="mr-1" />
                    <span className="hidden sm:inline-block">
                      {tCommon("actions.edit")}
                    </span>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
        <CardFooter className="md:hidden">
          {isLoading || !isConfigReady ? (
            <Skeleton className="h-9 w-full" />
          ) : canAccessPremiumFeatures ? (
            <Button className="w-full" onClick={handleCreateSnippet}>
              <Plus className="mr-2 size-4" />
              {tCommon("actions.add")}
            </Button>
          ) : (
            <UpgradeCta
              labelKey="snippets_add"
              className="h-9 w-full px-4"
            />
          )}
        </CardFooter>
      </Card>

      <SnippetEditDialog
        snippet={selectedSnippet}
        schemas={schemas}
        open={modalOpen}
        onOpenChange={(open) => {
          if (!open) handleCloseModal();
        }}
        onSuccess={() => {
          // Trigger refresh manually or invalidate tags
          setIsLoadingSnippets(true);
          // Wait a bit for git commit to propagate (if necessary) or just re-fetch
          setTimeout(() => {
            if (isGitLabProvider(config.provider)) {
              dispatch(
                gitlabApi.util.invalidateTags([
                  { type: "GitLabTree", id: "LIST" },
                ]),
              );
            } else {
              dispatch(
                githubContentApi.util.invalidateTags([
                  { type: "GitHubFiles", id: "LIST" },
                ]),
              );
            }
            loadData();
          }, 500);
          handleCloseModal();
        }}
      />
    </>
  );
};

type SnippetEditDialogProps = {
  snippet: SnippetFile | null;
  schemas: SchemaFile[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
};

function SnippetEditDialog({
  snippet,
  schemas,
  open,
  onOpenChange,
  onSuccess,
}: SnippetEditDialogProps) {
  const tProjectSettingsSnippets = useTranslations("project-settings.snippets");
  // delegate form rendering/logic to SnippetForm

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto md:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {snippet
              ? tProjectSettingsSnippets("edit_dialog_title")
              : tProjectSettingsSnippets("create_dialog_title")}
          </DialogTitle>
          <DialogDescription>
            {tProjectSettingsSnippets("dialog_description")}
          </DialogDescription>
        </DialogHeader>

        <SnippetForm
          snippet={snippet}
          schemas={schemas}
          onSuccess={onSuccess}
        />
      </DialogContent>
    </Dialog>
  );
}

export default SnippetList;
