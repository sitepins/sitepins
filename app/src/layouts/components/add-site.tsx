"use client";

import {
  hasAddSiteExtraPanel,
  AddSiteExtraPanel,
} from "@/components/add-site-extras";
import { Button, ButtonProps } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { UnlockCta } from "@/components/unlock-cta";
import { useDebounce } from "@/hooks/use-debounce";
import { useDialog } from "@/hooks/use-dialog";
import { useAllInstallationRepos } from "@/hooks/use-fetch-repos";
import { useGitAuth } from "@/hooks/use-git-auth";
import { useFeatureAccess } from "@/hooks/use-feature-access";
import { useSiteLimit } from "@/hooks/use-plan-limits";
import { openUnlockPrompt } from "@/hooks/use-unlock-prompt";
import { IS_DEMO } from "@/lib/constant";
import { cn } from "@/lib/utils/cn";
import { isDemoUrl } from "@/lib/utils/demo-urls";
import { errorMessage } from "@/lib/utils/error";
import {
  isGitHubProvider,
  isGitLabProvider,
  TGitProvider,
} from "@/lib/utils/provider-checker";
import { projectSchema } from "@/lib/validate";
import { useGetGitHubBranchesQuery as useGitHubBranches } from "@/redux/features/github";
import { useGetGitLabBranchesQuery } from "@/redux/features/gitlab/gitlab-api";
import { useGetOrgQuery } from "@/redux/features/orgs/org-api";
import { useAddProjectMutation } from "@/redux/features/project/project-api";
import { zodResolver } from "@hookform/resolvers/zod";
import { SiGithub, SiGitlab } from "@icons-pack/react-simple-icons";
import { ExternalLink, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod/v4";
import FormError from "./form-error";
import { Badge } from "./ui/badge";

const REPO_LIST_LIMIT = 100;

const providersList: {
  name: string;
  label: string;
  value: TGitProvider;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  tag?: string;
}[] = [
  {
    name: "Github",
    label: "Github",
    value: "Github",
    icon: SiGithub,
  },
  {
    name: "gitlab",
    label: "Gitlab",
    value: "Gitlab",
    icon: SiGitlab,
  },
];

type AddSiteProps = ButtonProps & {
  orgId?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export default function AddSite({
  orgId,
  children,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  ...props
}: AddSiteProps) {
  const router = useRouter();
  const tAddSite = useTranslations("add-site");
  const { data: org } = useGetOrgQuery(orgId ? orgId?.slice(4) : "", {
    skip: !orgId,
  });

  const { hasTeamFeatures } = useFeatureAccess();
  const { isOpen: internalOpen, onOpenChange: internalOnOpenChange } =
    useDialog();

  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const onOpenChange = controlledOnOpenChange || internalOnOpenChange;
  const [repoOpen, setRepoOpen] = useState(false);
  const [creationError, setCreationError] = useState<string | null>(null);
  const [isLimitError, setIsLimitError] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const projectForm = useForm<z.infer<typeof projectSchema>>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      provider: "Github",
      repository: "",
      branch: "",
      project_name: "",
      site_url: "",
      visibility: "public",
      project_image: "",
    },
  });

  const branch = projectForm.watch("branch");
  const repository = projectForm.watch("repository");
  const provider = projectForm.watch("provider");
  const { providers, handleClick, isTokenChanged, selectedProvider } =
    useGitAuth({
      ignore: !isOpen,
      selectedProvider: provider,
    });

  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  const {
    repositories: repos,
    isLoading: repoLoading,
    refetch: refetchRepos,
  } = useAllInstallationRepos({
    provider,
    token: selectedProvider?.accessToken,
    search: debouncedSearchQuery,
    skip: !isOpen || IS_DEMO,
  });

  useEffect(() => {
    if (isTokenChanged) {
      refetchRepos();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTokenChanged]);

  const { data: ghBranches, isLoading: isGhBranchLoading } = useGitHubBranches(
    {
      owner: repository?.split("/")[0] ?? "",
      repo: repository?.split("/")[1] ?? "",
    },
    {
      skip: IS_DEMO || !repository || !isGitHubProvider(provider),
      refetchOnMountOrArgChange: true,
    },
  );

  const reposByName = useMemo(
    () => new Map(repos.map((repo) => [repo.full_name, repo])),
    [repos],
  );
  const repoNames = useMemo(() => [...reposByName.keys()], [reposByName]);
  const selectedRepo = reposByName.get(repository);

  const { data: glBranches, isLoading: isGlBranchLoading } =
    useGetGitLabBranchesQuery(
      {
        id: selectedRepo?.id || repository,
        token: selectedProvider?.accessToken,
      },
      {
        skip: IS_DEMO || !repository || !isGitLabProvider(provider),
        refetchOnMountOrArgChange: true,
      },
    );

  const branches = isGitLabProvider(provider) ? glBranches : ghBranches;
  const isBranchLoading = isGitLabProvider(provider)
    ? isGlBranchLoading
    : isGhBranchLoading;

  // Default Selected Branch
  useEffect(() => {
    projectForm.setValue(
      "branch",
      branches?.length && branches?.length === 1 ? branches[0]?.name || "" : "",
    );
  }, [branches, projectForm]);

  const [addProject, { isLoading: isProjectAdding }] = useAddProjectMutation();

  const [step, setStep] = useState<"selection" | "form">("selection");

  // Reset step when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setStep("selection");
      setCreationError(null);
      setIsLimitError(false);
      projectForm.reset();
    }
  }, [isOpen, projectForm]);

  // Navigate to form step if integrated
  useEffect(() => {
    if (isTokenChanged && step === "selection") {
      setStep("form");
    }
  }, [isTokenChanged, step]);

  const handleProviderSelect = (val: TGitProvider) => {
    if (isGitLabProvider(val) && !hasTeamFeatures) {
      openUnlockPrompt("gitlab");
      return;
    }

    projectForm.setValue("provider", val);
    projectForm.setValue("repository", "");
    projectForm.setValue("branch", "");

    const integration = providers?.find((p) => p.provider === val);

    if (integration?.accessToken) {
      setStep("form");
    } else {
      handleClick(val);
    }
  };

  const siteLimit = useSiteLimit(org);

  // Opening the dialog with no room for a site shows the unlock prompt instead.
  useEffect(() => {
    if (siteLimit.isFull && isOpen) {
      onOpenChange(false);
      openUnlockPrompt("site_limit");
    }
  }, [siteLimit.isFull, isOpen, onOpenChange]);

  if (siteLimit.isFull) {
    return children ? (
      <Button
        {...props}
        onClick={(event) => {
          props.onClick?.(event);
          openUnlockPrompt("site_limit");
        }}
      >
        {children}
      </Button>
    ) : null;
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        {children && (
          <DialogTrigger asChild>
            <Button {...props}>{children}</Button>
          </DialogTrigger>
        )}
        <DialogContent
          className="gap-6 lg:max-w-3xl"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="text-xl">
              {step === "selection"
                ? tAddSite("add_new_site")
                : tAddSite("create_new_site")}
            </DialogTitle>
            <DialogDescription>
              {step === "selection"
                ? tAddSite("import_site_desc")
                : tAddSite("add_to_org_desc")}
            </DialogDescription>
          </DialogHeader>

          {step === "selection" ? (
            <div
              className={cn(
                "grid gap-6",
                hasAddSiteExtraPanel && "md:grid-cols-2",
              )}
            >
              <div className="space-y-6">
                {providersList.map((p) => {
                  const isConnected = providers?.some(
                    (prov) => prov.provider === p.value && prov.accessToken,
                  );

                  return (
                    <button
                      key={p.value}
                      onClick={() => handleProviderSelect(p.value)}
                      className="bg-background hover:bg-light border-border flex w-full items-center justify-between rounded-xl border p-5 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="bg-background border-border flex size-12 items-center justify-center rounded-lg border">
                          <p.icon className="size-8" />
                        </div>
                        <span className="leading-none font-semibold">
                          {p.label}
                        </span>
                      </div>
                      {isConnected ? (
                        <Badge variant="success" className="ms-auto h-5 gap-1">
                          {tAddSite("connected")}
                        </Badge>
                      ) : (
                        <Badge variant="warning" className="ms-auto h-5 gap-1">
                          {tAddSite("not_connected")}
                        </Badge>
                      )}
                    </button>
                  );
                })}
              </div>

              <AddSiteExtraPanel />
            </div>
          ) : (
            <form
              id="add-site-form"
              onSubmit={projectForm.handleSubmit(async (data) => {
                try {
                  if (!orgId) return;
                  setCreationError(null);
                  setIsLimitError(false);
                  const limitError = siteLimit.getCreateError(data.visibility);
                  if (limitError) {
                    setCreationError(limitError);
                    setIsLimitError(true);
                    return;
                  }
                  const { org_id, project_id } = await addProject({
                    org_id: orgId.slice(4),
                    branch: data.branch,
                    project_name: data.project_name,
                    provider: data.provider,
                    repository: data.repository,
                    site_url: data.site_url,
                    visibility: data.visibility,
                  }).unwrap();
                  toast.success(tAddSite("project_created_success"));
                  router.push(`/org-${org_id}/${project_id}`);
                } catch (error) {
                  // Server messages are English regardless of UI locale, so
                  // matching against them here is safe — unlike matching
                  // against the translated string set in the branch above.
                  const message = errorMessage(error);
                  setCreationError(message || tAddSite("something_went_wrong"));
                  setIsLimitError(
                    Boolean(message && siteLimit.isLimitError(message)),
                  );
                }
              })}
              ref={formRef}
              className="mx-auto w-full space-y-3 text-start"
            >
              <FieldGroup>
                <div className="grid grid-cols-2 gap-4">
                  <Controller
                    name="project_name"
                    control={projectForm.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="project_name">
                          {tAddSite("site_name_label")}
                        </FieldLabel>
                        <Input
                          {...field}
                          id="project_name"
                          aria-invalid={fieldState.invalid}
                          placeholder={tAddSite("site_name_placeholder")}
                          autoComplete="off"
                        />
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </Field>
                    )}
                  />

                  <Controller
                    name="provider"
                    control={projectForm.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor="provider">
                          {tAddSite("git_provider_label")}
                        </FieldLabel>
                        <Select
                          onValueChange={(value) => {
                            if (isGitLabProvider(value) && !hasTeamFeatures) {
                              openUnlockPrompt("gitlab");
                              return;
                            }
                            field.onChange(value);
                            projectForm.setValue("repository", "");
                            projectForm.setValue("branch", "");
                          }}
                          value={field.value}
                        >
                          <SelectTrigger>
                            <SelectValue
                              placeholder={tAddSite(
                                "choose_provider_placeholder",
                              )}
                            />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {providersList?.map((provider) => (
                                <SelectItem
                                  key={provider.name}
                                  value={provider.value}
                                  className="text-sm"
                                >
                                  <div className="flex w-full items-center gap-2">
                                    <provider.icon className="size-5" />
                                    <span className="flex-1">
                                      {provider.label}
                                    </span>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </Field>
                    )}
                  />
                </div>

                <Controller
                  name="repository"
                  control={projectForm.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="repository">
                        {tAddSite("repository_label")}
                      </FieldLabel>
                      <Combobox
                        open={repoOpen}
                        onOpenChange={setRepoOpen}
                        value={field.value}
                        items={repoNames}
                        limit={REPO_LIST_LIMIT}
                        onValueChange={(currentValue: string | null) => {
                          const repo = currentValue
                            ? reposByName.get(currentValue)
                            : undefined;
                          if (repo) {
                            const homepage = repo.homepage ?? "";
                            projectForm.setValue(
                              "site_url",
                              isDemoUrl(homepage) ? "" : homepage,
                            );
                            projectForm.setValue(
                              "visibility",
                              repo.visibility === "private"
                                ? "private"
                                : "public",
                            );
                          }
                          field.onChange(currentValue);
                          setRepoOpen(false);
                        }}
                      >
                        <ComboboxInput
                          placeholder={
                            repoLoading
                              ? tAddSite("please_wait")
                              : repository ||
                                tAddSite("select_repository_placeholder")
                          }
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            setSearchQuery(e.target.value)
                          }
                          isLoading={repoLoading}
                        />
                        <ComboboxContent
                          align={"start"}
                          className="w-full"
                          disablePortal
                        >
                          <ComboboxEmpty>
                            {repoLoading
                              ? tAddSite("please_wait")
                              : tAddSite("no_repository_found")}
                          </ComboboxEmpty>
                          <ComboboxList>
                            {(fullName: string) => {
                              const repo = reposByName.get(fullName);
                              if (!repo) return null;
                              return (
                                <ComboboxItem
                                  key={repo.full_name}
                                  value={repo.full_name}
                                >
                                  <div className="group flex w-full items-center">
                                    <span className="text-nowrap opacity-50">
                                      {repo.owner?.login}/
                                    </span>
                                    <span className="w-full text-start">
                                      {repo.name}
                                    </span>

                                    {repo.html_url && (
                                      <Link
                                        href={repo.html_url}
                                        target="_blank"
                                        prefetch={false}
                                        onClick={(e: React.MouseEvent) => {
                                          e.stopPropagation();
                                        }}
                                        className="hidden group-hover:block"
                                      >
                                        <ExternalLink className="ms-auto size-4 shrink-0 opacity-50" />
                                      </Link>
                                    )}
                                  </div>
                                </ComboboxItem>
                              );
                            }}
                          </ComboboxList>
                        </ComboboxContent>
                      </Combobox>
                      <FieldDescription className="mt-1!">
                        <span className="text-sm">
                          {tAddSite("cant_see_repo")}{" "}
                        </span>
                        <Button
                          variant={"link"}
                          className="h-auto p-0 underline"
                          type="button"
                          onClick={() => handleClick()}
                        >
                          {tAddSite("configure_on", { provider })}
                        </Button>
                      </FieldDescription>
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />

                <Controller
                  name="branch"
                  control={projectForm.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="branch">
                        {tAddSite("branch_label")}
                      </FieldLabel>
                      <Select
                        onValueChange={(value) => {
                          if (isBranchLoading || !value) return;
                          field.onChange(value);
                        }}
                        value={branch}
                        disabled={isBranchLoading || !repository}
                      >
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              isBranchLoading ? (
                                <div className="relative inline-flex items-center justify-center">
                                  <Loader2 className="absolute inset-s-0 inline-block size-4 animate-spin" />
                                  <span className="ps-5">
                                    {tAddSite("please_wait")}
                                  </span>
                                </div>
                              ) : (
                                tAddSite("choose_branch_placeholder")
                              )
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {branches?.map((branch) => (
                              <SelectItem
                                key={branch.name}
                                value={branch.name}
                                className="text-sm"
                              >
                                {branch.name}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />

                <Controller
                  name="site_url"
                  control={projectForm.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor="site_url">
                        {tAddSite("site_url_label")}
                      </FieldLabel>
                      <Input
                        type="url"
                        placeholder={tAddSite("site_url_placeholder")}
                        {...field}
                        id="site_url"
                        aria-invalid={fieldState.invalid}
                        autoComplete="off"
                      />
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />
              </FieldGroup>

              <FormError
                message={creationError ?? undefined}
                isError={Boolean(creationError)}
                error={null}
                onReset={() => {
                  setCreationError(null);
                  setIsLimitError(false);
                }}
              />
              {isLimitError && (
                <div className="mt-2">
                  <UnlockCta labelKey="private_sites" size="sm" />
                </div>
              )}
            </form>
          )}

          {step === "form" ? (
            <DialogFooter className="sm:justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep("selection")}
              >
                {tAddSite("back")}
              </Button>
              <Button
                form="add-site-form"
                type="submit"
                isLoading={isProjectAdding}
                disabled={(providers?.length || 0) === 0 || isProjectAdding}
              >
                {tAddSite("create_site")}
              </Button>
            </DialogFooter>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
