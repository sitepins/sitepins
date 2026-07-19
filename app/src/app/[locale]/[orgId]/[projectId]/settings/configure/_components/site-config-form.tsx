"use client";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from "@/components/ui/combobox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import manifest from "@/config/manifest.json";
import { authClient } from "@/lib/auth/auth-client";
import { cn } from "@/lib/utils/cn";
import detectFramework from "@/lib/utils/framework-detector";
import isConfigFile from "@/lib/utils/is-config-file";
import {
  isGitHubProvider,
  isGitLabProvider,
} from "@/lib/utils/provider-checker";
import { configFormSchema } from "@/lib/validate";
import { selectConfig, updateConfig } from "@/redux/features/config/slice";
import {
  githubContentApi,
  useGetGitHubTreesQuery,
  useUpdateGitHubFilesMutation,
} from "@/redux/features/github";
import {
  gitlabContentApi,
  useGetGitLabTreesQuery,
  useUpdateGitLabFilesMutation,
} from "@/redux/features/gitlab";
import { useAddProjectLogMutation } from "@/redux/features/project-log/project-log-api";
import { EAction, EProjectLogType } from "@/redux/features/project-log/type";
import { SUPPORT_URL } from "@/lib/brand";
import { useAppDispatch, useAppSelector } from "@/redux/store";
import { TTree } from "@/types";
import { zodResolver } from "@hookform/resolvers/zod";
import { CircleQuestionMark, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod/v4";

// Filter folders from trees
const getFolderOptions = (trees: TTree[]) =>
  trees?.filter(
    (tree) => tree.type !== "blob" && !tree.path?.startsWith("."),
  ) || [];

// Check if a folder contains config files
const folderContainsConfigFiles = (folderPath: string, trees: TTree[]) => {
  return trees.some(
    (tree) =>
      tree.type === "blob" &&
      tree.path?.startsWith(folderPath + "/") &&
      isConfigFile(tree.path),
  );
};

// Reusable FolderSelector component
interface FolderSelectorProps {
  value?: { value: string; label: string } | null;
  onChange: (value: { value: string; label: string }) => void;
  placeholder: string;
  folders: TTree[];
  onSelect?: (value: string) => void;
}

const folderSuggestion = {
  nextjs: {
    content: "`src/content`",
    media: "`public/images`",
    public: "`public`",
    config: "`src/config`",
  },
  astro: {
    content: "`src/content`",
    media: "`public/images`",
    public: "`public`",
    config: "`src/config`",
  },
  hugo: {
    content: "`content`",
    media: "`assets/images` or `static/images`",
    public: "`static`",
    config: "`config/_default`, `data`, `hugo.toml`",
  },
  hugo_examplesite: {
    content: "`exampleSite/content`",
    media: "`exampleSite/assets/images` or `exampleSite/static/images`",
    public: "`exampleSite/static`",
    config:
      "`exampleSite/config/_default`, `exampleSite/data`, `exampleSite/hugo.toml`",
  },
};

function FolderSelector({
  value,
  onChange,
  placeholder,
  folders,
  onSelect,
}: FolderSelectorProps) {
  const tProjectSettingsConfigureProject = useTranslations(
    "project-settings.configure.project",
  );
  return (
    <Combobox
      value={value?.value}
      onValueChange={(currentValue) => {
        onChange({
          value: currentValue as string,
          label: currentValue as string,
        });
        onSelect?.(currentValue as string);
      }}
      items={folders.map((folder) => folder.path)}
    >
      <ComboboxInput placeholder={value?.value || placeholder} />
      <ComboboxContent>
        <ComboboxEmpty>
          {tProjectSettingsConfigureProject("form.no_results")}
        </ComboboxEmpty>
        <ComboboxList>
          {(item) => (
            <ComboboxItem key={item} value={item}>
              {item}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

export const ConfigForm = ({
  className,
  onSaved,
}: {
  className?: string;
  onSaved?: () => void;
}) => {
  const params = useParams();

  const { data: auth } = authClient.useSession();
  const config = useAppSelector(selectConfig);
  const dispatch = useAppDispatch();
  const tProjectSettingsConfigureProject = useTranslations(
    "project-settings.configure.project",
  );
  const tCommon = useTranslations("common");

  const [addLog] = useAddProjectLogMutation();
  const [updateFile, { isLoading: isGhPending }] =
    useUpdateGitHubFilesMutation();
  const [updateGitLabFiles, { isLoading: isGlPending }] =
    useUpdateGitLabFilesMutation();

  const anchor = useComboboxAnchor();

  const { data: ghData } = useGetGitHubTreesQuery(
    {
      owner: config.owner,
      repo: config.repoName,
      tree_sha: config.branch,
      recursive: "1",
      config: config,
    },
    {
      skip:
        !config.token ||
        !config.repoName ||
        !config.owner ||
        !config.branch ||
        !isGitHubProvider(config.provider),
    },
  );

  const { data: glData } = useGetGitLabTreesQuery(
    {
      id: config.repoName ? `${config.owner}/${config.repoName}` : config.owner,
      ref: config.branch,
      recursive: true,
      config: config,
    },
    {
      skip:
        !config.token ||
        !config.repoName ||
        !config.owner ||
        !config.branch ||
        !isGitLabProvider(config.provider),
    },
  );

  const data = isGitLabProvider(config.provider) ? glData : ghData;
  const isPending = isGitLabProvider(config.provider)
    ? isGlPending
    : isGhPending;

  const configForm = useForm<z.infer<typeof configFormSchema>>({
    resolver: zodResolver(configFormSchema),
    defaultValues: {
      content: {
        value: config?.content || "",
        label:
          config?.content ||
          tProjectSettingsConfigureProject("form.content_placeholder"),
      },
      media: {
        value: config?.media || "",
        label:
          config?.media ||
          tProjectSettingsConfigureProject("form.media_placeholder"),
      },
      public: {
        value: config?.public || "",
        label:
          config?.public ||
          tProjectSettingsConfigureProject("form.public_placeholder"),
      },
      configurations: config.configs || [],
    },
    mode: "onChange",
  });

  const { files: trees = [] } = data || {};
  const watchedValues = configForm.watch();
  const folderOptions = getFolderOptions(trees);
  const detectedFramework = useMemo(() => detectFramework(trees), [trees]);

  // framework-specific folder suggestions
  const suggestions = useMemo(() => {
    const defaults = {
      content: tProjectSettingsConfigureProject("form.suggestions.content"),
      media: tProjectSettingsConfigureProject("form.suggestions.media"),
      public: tProjectSettingsConfigureProject("form.suggestions.public"),
      config: tProjectSettingsConfigureProject("form.suggestions.config"),
    };

    if (!detectedFramework) return defaults;
    const frameworkSuggestions = folderSuggestion[detectedFramework];
    if (!frameworkSuggestions) return defaults;

    return {
      ...frameworkSuggestions,
    };
  }, [detectedFramework, tProjectSettingsConfigureProject]);

  const shouldSkipPublicSetup =
    !config.content &&
    detectedFramework &&
    ["hugo", "hugo_examplesite", "astro", "nextjs"].includes(detectedFramework);

  const [currentStep, setCurrentStep] = useState(0);

  const displayStep = useMemo(() => {
    if (!shouldSkipPublicSetup) return currentStep;
    return currentStep <= 1 ? currentStep : currentStep - 1;
  }, [currentStep, shouldSkipPublicSetup]);

  const totalStepsCount = shouldSkipPublicSetup ? 3 : 4;

  const isChanged = useMemo(() => {
    const {
      content: contentRoot,
      media: mediaRoot,
      configurations,
    } = configForm.getValues();

    // Compare configurations by content (set equality) instead of only length
    const currentThemes = configurations || [];
    const savedThemes = config.configs || [];
    const themesChanged = (() => {
      if (currentThemes.length !== savedThemes.length) return true;
      const savedSet = new Set(savedThemes);
      return currentThemes.some((t: string) => !savedSet.has(t));
    })();

    return (
      contentRoot.value !== config.content ||
      mediaRoot.value !== config.media ||
      themesChanged ||
      watchedValues.public.value !== config.public
    );
  }, [watchedValues, config, configForm]);

  const handleSubmit = async (data: z.infer<typeof configFormSchema>) => {
    const files = [
      {
        path: ".sitepins/config.json",
        content: JSON.stringify(
          {
            content: data.content.value,
            media: data.media.value,
            public: data.public.value,
            configs: data.configurations,
            "custom-commit": config.customCommit ?? false,
            arrangement: data?.arrangement ?? config.arrangement ?? [],
          },
          null,
          2,
        ),
      },
    ];

    if (!config.content && data.public.value) {
      files.push({
        path: `${data.public.value}/.well-known/sitepins.json`,
        content: JSON.stringify(manifest, null, 2),
      });
    }

    try {
      const res = isGitLabProvider(config.provider)
        ? await updateGitLabFiles({
            id: config.repoName
              ? `${config.owner}/${config.repoName}`
              : config.owner,
            branch: config.branch,
            message: "Update config",
            files: files.map((f) => ({
              path: f.path,
              content: f.content,
            })),
          })
        : await updateFile({
            files,
            message: "Update config",
            owner: config.owner,
            repo: config.repoName,
            tree: config.branch,
          });

      if (!res.error?.message) {
        // update redux config so UI (sidebar/menu) refreshes immediately
        dispatch(
          updateConfig({
            content: data.content.value,
            media: data.media.value,
            public: data.public.value,
            configs: data.configurations,
            arrangement: data?.arrangement ?? config.arrangement ?? [],
          }),
        );

        // sidebar / RenderMenu refreshes immediately after saving.
        if (isGitLabProvider(config.provider)) {
          dispatch(
            gitlabContentApi.util.invalidateTags([
              { type: "GitLabFiles", id: "LIST" },
            ]),
          );
        } else {
          dispatch(
            githubContentApi.util.invalidateTags([
              { type: "GitHubFiles", id: "LIST" },
            ]),
          );
        }
        addLog({
          project_id: params.projectId as string,
          action: config.content ? EAction.UPDATE : EAction.CREATE,
          file: ".sitepins/config.json",
          file_type: EProjectLogType.CONFIG,
          user_id: auth?.user.user_id!,
        });

        toast.success(
          config.content
            ? tProjectSettingsConfigureProject("status.success_update")
            : tProjectSettingsConfigureProject("status.success_create"),
        );
        // Notify parent that save completed so it can close the modal if it was forced open
        onSaved?.();
      }
    } catch {
      toast.error(tProjectSettingsConfigureProject("status.error_update"));
    }
  };

  return (
    <DialogContent
      className="w-full max-w-[calc(100%-1rem)] sm:max-w-[calc(100%-2rem)] md:max-w-3xl"
      onInteractOutside={(e) => e.preventDefault()}
    >
      <DialogHeader>
        <DialogTitle>{tProjectSettingsConfigureProject("title")}</DialogTitle>
        <DialogDescription>
          {tProjectSettingsConfigureProject("description")}
        </DialogDescription>
      </DialogHeader>
      <div className="max-h-[70vh] w-full min-w-0 overflow-x-hidden overflow-y-auto">
        <form
          id="config-form"
          onSubmit={configForm.handleSubmit(handleSubmit)}
          className={cn("space-y-8", className)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
            }
          }}
        >
          {/* Wizard Progress or Regular Title */}
          {!config.content ? (
            <div className="mb-6">
              <div className="mb-2 flex justify-between">
                {[
                  tProjectSettingsConfigureProject("steps.content"),
                  tProjectSettingsConfigureProject("steps.media"),
                  !shouldSkipPublicSetup &&
                    tProjectSettingsConfigureProject("steps.public"),
                  tProjectSettingsConfigureProject("steps.configs"),
                ]
                  .filter((step): step is string => typeof step === "string")
                  .map((step, index) => (
                    <div
                      key={step}
                      className={cn(
                        "text-sm font-medium transition-colors",
                        index === displayStep
                          ? "text-primary"
                          : index < displayStep
                            ? "text-text-dark"
                            : "text-text-muted",
                      )}
                    >
                      {step}
                    </div>
                  ))}
              </div>
              <div className="bg-light h-2 w-full overflow-hidden rounded-full">
                <div
                  className="bg-primary h-full transition-all duration-300 ease-in-out"
                  style={{
                    width: `${((displayStep + 1) / totalStepsCount) * 100}%`,
                  }}
                />
              </div>
            </div>
          ) : null}

          {/* Content Folder */}
          <div
            className={cn(
              !config.content && currentStep !== 0 ? "hidden" : "block",
            )}
          >
            <FieldGroup>
              <Controller
                name="content"
                control={configForm.control}
                render={({ field, fieldState }) => (
                  <Field>
                    <FieldLabel htmlFor="form-content">
                      {tProjectSettingsConfigureProject("form.content_label")}
                    </FieldLabel>
                    {suggestions?.content && (
                      <FieldDescription className="mb-2 grid grid-cols-1 items-center gap-2 lg:grid-cols-[auto_1fr]">
                        <span className="text-accent flex shrink-0 items-center gap-2 font-medium">
                          <Sparkles className="text-accent size-3.5 shrink-0" />
                          {tProjectSettingsConfigureProject("form.suggested")}
                        </span>
                        <span className="min-w-0 flex-1 truncate font-mono break-all">
                          {suggestions.content}
                        </span>
                      </FieldDescription>
                    )}
                    <FolderSelector
                      value={field.value}
                      onChange={field.onChange}
                      placeholder={tProjectSettingsConfigureProject(
                        "form.content_placeholder",
                      )}
                      folders={folderOptions}
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />
            </FieldGroup>
          </div>

          <div
            className={cn(
              !config.content && currentStep !== 1 ? "hidden" : "block",
            )}
          >
            <Controller
              name="media"
              control={configForm.control}
              render={({ field, fieldState }) => (
                <Field>
                  <FieldLabel htmlFor="form-media">
                    {tProjectSettingsConfigureProject("form.media_label")}
                  </FieldLabel>
                  {suggestions?.media && (
                    <FieldDescription className="mb-2 grid grid-cols-1 items-center gap-2 lg:grid-cols-[auto_1fr]">
                      <span className="text-accent flex shrink-0 items-center gap-2 font-medium">
                        <Sparkles className="text-accent size-3.5 shrink-0" />
                        {tProjectSettingsConfigureProject("form.suggested")}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-mono break-all">
                        {suggestions.media}
                      </span>
                    </FieldDescription>
                  )}
                  <FolderSelector
                    value={field.value}
                    onChange={field.onChange}
                    placeholder={tProjectSettingsConfigureProject(
                      "form.media_placeholder",
                    )}
                    folders={folderOptions}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
          </div>

          {/* Public Folder */}
          <div
            className={cn(
              !config.content && currentStep !== 2 ? "hidden" : "block",
            )}
          >
            <Controller
              name="public"
              control={configForm.control}
              render={({ field, fieldState }) => (
                <Field>
                  <FieldLabel htmlFor="form-public">
                    {tProjectSettingsConfigureProject("form.public_label")}
                  </FieldLabel>

                  {suggestions?.public && (
                    <FieldDescription className="mb-2 grid grid-cols-1 items-center gap-2 lg:grid-cols-[auto_1fr]">
                      <span className="text-accent flex shrink-0 items-center gap-2 font-medium">
                        <Sparkles className="text-accent size-3.5 shrink-0" />
                        {tProjectSettingsConfigureProject("form.suggested")}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-mono break-all">
                        {suggestions.public}
                      </span>
                    </FieldDescription>
                  )}
                  <FolderSelector
                    value={field.value}
                    onChange={field.onChange}
                    placeholder={tProjectSettingsConfigureProject(
                      "form.public_placeholder",
                    )}
                    folders={folderOptions}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
          </div>

          {/* Config Files */}
          <div
            className={cn(
              !config.content && currentStep !== 3 ? "hidden" : "block",
            )}
          >
            <Controller
              name="configurations"
              control={configForm.control}
              render={({ field, fieldState }) => (
                <Field>
                  <FieldLabel htmlFor="form-config">
                    {tProjectSettingsConfigureProject("form.config_label")}
                  </FieldLabel>

                  {suggestions?.config && (
                    <FieldDescription className="mb-2 grid grid-cols-1 items-center gap-2 lg:grid-cols-[auto_1fr]">
                      <span className="text-accent flex shrink-0 items-center gap-2 font-medium">
                        <Sparkles className="text-accent size-3.5 shrink-0" />
                        {tProjectSettingsConfigureProject("form.suggested")}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-mono break-all">
                        {suggestions.config}
                      </span>
                    </FieldDescription>
                  )}
                  <Combobox
                    value={field.value}
                    onValueChange={field.onChange}
                    multiple
                    items={
                      trees
                        ?.filter(
                          (tree) =>
                            isConfigFile(tree.path) ||
                            (tree.type === "tree" &&
                              folderContainsConfigFiles(tree.path!, trees)),
                        )
                        .map((tree) => tree.path!) || []
                    }
                  >
                    <ComboboxChips ref={anchor} className="flex-wrap">
                      <ComboboxValue>
                        {(values) => (
                          <>
                            {values.map((value: string) => (
                              <ComboboxChip key={value}>{value}</ComboboxChip>
                            ))}
                            <ComboboxChipsInput
                              placeholder={tProjectSettingsConfigureProject(
                                "form.config_placeholder",
                              )}
                              className="ml-1"
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                }
                              }}
                            />
                          </>
                        )}
                      </ComboboxValue>
                    </ComboboxChips>
                    <ComboboxContent anchor={anchor}>
                      <ComboboxEmpty>
                        {tProjectSettingsConfigureProject("form.no_results")}
                      </ComboboxEmpty>
                      <ComboboxList>
                        {(item) => (
                          <ComboboxItem key={item} value={item}>
                            {item}
                          </ComboboxItem>
                        )}
                      </ComboboxList>
                    </ComboboxContent>
                  </Combobox>
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
          </div>
        </form>
      </div>
      <DialogFooter>
        {/* Help description — sits below buttons on mobile, left side on md+ */}
        <div className="flex w-full flex-col gap-3 md:flex-row md:items-center md:justify-between">
          {/* Buttons row */}
          <div
            className={cn(
              "flex gap-2 md:order-2",
              // Single button: full-width on mobile; two buttons: content-fit, end-aligned
              !config.content && currentStep > 0
                ? "w-full justify-end md:w-auto"
                : "w-full md:w-auto md:justify-end",
            )}
          >
            {!config.content && currentStep > 0 && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (shouldSkipPublicSetup && currentStep === 2) {
                    setCurrentStep((prev) => prev - 2);
                  } else {
                    setCurrentStep((prev) => prev - 1);
                  }
                }}
              >
                {tCommon("actions.previous")}
              </Button>
            )}

            {!config.content && currentStep < 3 ? (
              <Button
                key="next-button"
                type="button"
                className={cn(
                  // Full-width when it's the only button on mobile
                  !(currentStep > 0) && "flex-1 md:flex-none",
                )}
                onClick={async (e) => {
                  e.currentTarget.blur();
                  const fieldsToValidate: any[] = [];
                  if (currentStep === 0) fieldsToValidate.push("content");
                  if (currentStep === 1) fieldsToValidate.push("media");
                  if (currentStep === 2) fieldsToValidate.push("public");

                  const isValid = await configForm.trigger(fieldsToValidate);
                  if (isValid) {
                    if (shouldSkipPublicSetup && currentStep === 1) {
                      const suggestedPublic =
                        folderSuggestion[detectedFramework!]?.public;

                      if (suggestedPublic) {
                        const cleanPath = suggestedPublic
                          .replace(/`/g, "")
                          .trim();

                        configForm.setValue("public", {
                          value: cleanPath,
                          label: cleanPath,
                        });
                      }
                      setCurrentStep((prev) => prev + 2);
                    } else {
                      setCurrentStep((prev) => prev + 1);
                    }
                  }
                }}
              >
                {tCommon("actions.next")}
              </Button>
            ) : (
              <Button
                form="config-form"
                key="save-button"
                disabled={!isChanged && !!config.content}
                type="submit"
                isLoading={isPending}
                className={cn(
                  // Full-width when it's the only button on mobile
                  !(currentStep > 0) && "flex-1 md:flex-none",
                )}
              >
                {config.content
                  ? tCommon("actions.save")
                  : tCommon("actions.finish")}
              </Button>
            )}
          </div>

          {/* Help description — below buttons on mobile, left on md+ */}
          <div className="flex items-center justify-center md:order-1 md:justify-start">
            <CircleQuestionMark className="mr-2 hidden size-5 shrink-0 sm:inline-block" />
            <p className="text-text-dark text-sm">
              {tProjectSettingsConfigureProject("help.text")}{" "}
              <Link
                target="_blank"
                href={SUPPORT_URL}
                className={buttonVariants({
                  variant: "link",
                  className: "text-accent! px-0!",
                })}
              >
                {tProjectSettingsConfigureProject("help.contact_us")}
              </Link>
              .
            </p>
          </div>
        </div>
      </DialogFooter>
    </DialogContent>
  );
};

export default function SiteConfig({ className }: { className?: string }) {
  const config = useAppSelector(selectConfig);
  const [modalOpen, setModalOpen] = useState(false);
  const tProjectSettingsConfigureProject = useTranslations(
    "project-settings.configure.project",
  );

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>
            {tProjectSettingsConfigureProject("summary.title")}
          </CardTitle>
          <CardDescription>
            {tProjectSettingsConfigureProject("summary.description")}
          </CardDescription>
        </CardHeader>

        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <div className="text-muted-foreground text-xs">
                {tProjectSettingsConfigureProject("form.content_label")}
              </div>
              <div className="text-sm font-medium">
                {config.content ||
                  tProjectSettingsConfigureProject("status.not_configured")}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">
                {tProjectSettingsConfigureProject("form.media_label")}
              </div>
              <div className="text-sm font-medium">
                {config.media ||
                  tProjectSettingsConfigureProject("status.not_configured")}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs">
                {tProjectSettingsConfigureProject("form.public_label")}
              </div>
              <div className="text-sm font-medium">
                {config.public ||
                  tProjectSettingsConfigureProject("status.not_configured")}
              </div>
            </div>

            <div>
              <div className="text-muted-foreground text-xs">
                {tProjectSettingsConfigureProject("form.config_label")}
              </div>
              <div className="text-sm font-medium">
                {!config.configs || config.configs.length === 0 ? (
                  <span>{tProjectSettingsConfigureProject("status.none")}</span>
                ) : (
                  <span className="block truncate">
                    {config.configs.join(", ")}
                  </span>
                )}
              </div>
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <Button
            className="w-full sm:w-auto"
            onClick={() => setModalOpen(true)}
          >
            {tProjectSettingsConfigureProject("buttons.update")}
          </Button>
        </CardFooter>
      </Card>
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <ConfigForm
          className="w-full"
          onSaved={() => {
            setModalOpen(false);
          }}
        />
      </Dialog>
    </>
  );
}
