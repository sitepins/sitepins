"use client";

import { QuotaUpgradeAction } from "@/components/quota-upgrade-action";
import {
  TemplateStartPanel,
  hasTemplatePanel,
} from "@/components/template-start-panel";
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
import { UpgradeDialog } from "@/components/upgrade-dialog";
import { useDebounce } from "@/hooks/use-debounce";
import { useDialog } from "@/hooks/use-dialog";
import { useAllInstallationRepos } from "@/hooks/use-fetch-repos";
import { useGitAuth } from "@/hooks/use-git-auth";
import { useOwnerPlan } from "@/hooks/use-owner-plan";
import { authClient } from "@/lib/auth/auth-client";
import { getPlanLimits } from "@/lib/limits";
import { cn } from "@/lib/utils/cn";
import { isDemoUrl } from "@/lib/utils/demo-urls";
import { errorMessage } from "@/lib/utils/error";
import {
  isGitHubProvider,
  isGitLabProvider,
  TGitProvider,
} from "@/lib/utils/provider-checker";
import { projectSchema } from "@/lib/validate";
import { AxiosBaseQueryError } from "@/redux/features/api-slice";
import { useGetGitHubBranchesQuery as useGitHubBranches } from "@/redux/features/github";
import { useGetGitLabBranchesQuery } from "@/redux/features/gitlab/gitlab-api";
import { useGetOrgQuery, useGetOrgsQuery } from "@/redux/features/orgs/org-api";
import { selectCurrentPackage } from "@/redux/features/plan/slice";
import {
  useAddProjectMutation,
  useGetProjectsQuery,
} from "@/redux/features/project/project-api";
import { useAppSelector } from "@/redux/store";
import { zodResolver } from "@hookform/resolvers/zod";
import { SiGithub, SiGitlab } from "@icons-pack/react-simple-icons";
import { ExternalLink, Loader2, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod/v4";
import AddOrg from "./add-org";
import FormError from "./form-error";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./ui/alert-dialog";
import { Badge } from "./ui/badge";

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
  const { data: orgs = [] } = useGetOrgsQuery();
  const { data: projects } = useGetProjectsQuery(orgId ? orgId?.slice(4) : "", {
    skip: !orgId,
  });

  const activeProjects = projects?.filter((p) => p.status !== "archived") || [];
  const { currentPackage } = useAppSelector(selectCurrentPackage);
  const { canAccessProPlusFeatures } = useOwnerPlan();
  const { isOpen: internalOpen, onOpenChange: internalOnOpenChange } =
    useDialog();

  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const onOpenChange = controlledOnOpenChange || internalOnOpenChange;
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [showAddOrg, setShowAddOrg] = useState(false);
  const [showUpgradeOrg, setShowUpgradeOrg] = useState(false);
  const [repoOpen, setRepoOpen] = useState(false);
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
      skip: !repository || !isGitHubProvider(provider),
      refetchOnMountOrArgChange: true,
    },
  );

  const selectedRepo = repos?.find((repo) => repo.full_name === repository);

  const { data: glBranches, isLoading: isGlBranchLoading } =
    useGetGitLabBranchesQuery(
      {
        id: selectedRepo?.id || repository,
        token: selectedProvider?.accessToken,
      },
      {
        skip: !repository || !isGitLabProvider(provider),
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

  const [addProject, { isLoading: isProjectAdding, error, isError }] =
    useAddProjectMutation();

  const [step, setStep] = useState<"selection" | "form">("selection");

  // Reset step when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setStep("selection");
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
    if (isGitLabProvider(val) && !canAccessProPlusFeatures) {
      setShowUpgradeDialog(true);
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

  const checkSiteLimit = (count: number) => {
    // No org context yet — nothing to add a site to.
    if (!org) return true;
    // A missing owner record means an unknown plan, which getPlanLimits
    // already resolves to the edition's default package.
    const owner = (org.ownerData || []).find(
      (owner) => owner.user_id === org.owner,
    );
    return count >= getPlanLimits(owner?.active_package).org_site_limit;
  };

  const isSiteLimitReached = checkSiteLimit(activeProjects.length);

  const { data: auth } = authClient.useSession();
  const userId = auth?.user?.user_id;

  // Check if user can add new org based on their package limit
  const canAddOrg = useMemo(() => {
    if (!currentPackage || !userId) return false;
    const limit = getPlanLimits(currentPackage).org_limit;
    const ownOrgs =
      orgs?.filter(
        (org) => org.owner === userId && org.status !== "archived",
      ) || [];
    return (ownOrgs?.length ?? 0) < limit;
  }, [currentPackage, orgs, userId]);

  if (isSiteLimitReached) {
    return (
      <>
        <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
          {children && (
            <AlertDialogTrigger asChild>
              <Button {...props}>{children}</Button>
            </AlertDialogTrigger>
          )}
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{tAddSite("scaling_fast")}</AlertDialogTitle>
              <AlertDialogDescription>
                {tAddSite("create_new_org_to_add")}
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className="flex flex-col items-center py-6 text-center">
              <div className="w-full">
                <div className="mb-3 flex items-center justify-between text-sm font-semibold">
                  <span className="text-muted-foreground">
                    {tAddSite("org_usage")}
                  </span>
                  <span className="text-primary">
                    {activeProjects.length} /{" "}
                    {getPlanLimits(currentPackage).org_site_limit === Infinity
                      ? tAddSite("unlimited")
                      : getPlanLimits(currentPackage).org_site_limit}{" "}
                    {tAddSite("sites")}
                  </span>
                </div>
                <div className="bg-border/50 h-3 w-full overflow-hidden rounded-full">
                  <div
                    className="bg-primary h-full rounded-full shadow-[0_0_12px_rgba(var(--primary),0.5)] transition-all duration-1000 ease-out"
                    style={{ width: "100%" }}
                  ></div>
                </div>
                <p className="text-muted-foreground mt-3 text-xs font-medium italic">
                  {tAddSite("quota_limit_reached")}
                </p>
              </div>
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="sm:w-36"
              >
                {tAddSite("maybe_later")}
              </AlertDialogCancel>
              {canAddOrg ? (
                <AlertDialogAction
                  onClick={() => {
                    onOpenChange(false);
                    setShowAddOrg(true);
                  }}
                  className="group sm:w-44"
                >
                  <Plus className="mr-1 h-4 w-4" />
                  {tAddSite("create_new_org")}
                </AlertDialogAction>
              ) : (
                <QuotaUpgradeAction />
              )}
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <UpgradeDialog
          open={showUpgradeDialog}
          onOpenChange={setShowUpgradeDialog}
          contextKey="gitlab"
        />

        <AddOrg
          open={showAddOrg}
          onOpenChange={setShowAddOrg}
          className="hidden"
        />

        <UpgradeDialog
          open={showUpgradeOrg}
          onOpenChange={setShowUpgradeOrg}
          contextKey="org_limit"
        />
      </>
    );
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
              className={cn("grid gap-6", hasTemplatePanel && "md:grid-cols-2")}
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
                        <Badge variant="success" className="ml-auto h-5 gap-1">
                          {tAddSite("connected")}
                        </Badge>
                      ) : (
                        <Badge variant="warning" className="ml-auto h-5 gap-1">
                          {tAddSite("not_connected")}
                        </Badge>
                      )}
                    </button>
                  );
                })}
              </div>

              <TemplateStartPanel />
            </div>
          ) : (
            <form
              id="add-site-form"
              onSubmit={projectForm.handleSubmit(async (data) => {
                try {
                  if (!orgId) return;
                  if (data.visibility === "private") {
                    if (!org) return;
                    const ownerArray = org.ownerData || [];
                    const owner = ownerArray.find(
                      (owner) => owner.user_id === org.owner,
                    );
                    if (!owner) return;
                    const active_package = owner.active_package;
                    const privateCount =
                      activeProjects.filter((p) => p.visibility === "private")
                        .length || 0;
                    if (
                      privateCount >=
                      getPlanLimits(active_package).org_private_site_limit
                    ) {
                      toast.error(tAddSite("private_site_limit_reached"));
                      return;
                    }
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
                  toast.error(
                    errorMessage(error) || tAddSite("something_went_wrong"),
                  );
                }
              })}
              ref={formRef}
              className="mx-auto w-full space-y-3 text-left"
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
                            if (
                              isGitLabProvider(value) &&
                              !canAccessProPlusFeatures
                            ) {
                              setShowUpgradeDialog(true);
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
                        items={repos?.map((repo) => repo.full_name)}
                        onValueChange={(currentValue: string | null) => {
                          const repo = repos?.find(
                            (r) => r.full_name === currentValue,
                          );
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
                              const repo = repos?.find(
                                (r) => r.full_name === fullName,
                              );
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
                                    <span className="w-full text-left">
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
                                        <ExternalLink className="ml-auto size-4 shrink-0 opacity-50" />
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
                                  <Loader2 className="absolute left-0 mr-1 inline-block size-4 animate-spin" />
                                  <span className="pl-5">
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
                message={(error as AxiosBaseQueryError)?.data.message}
                isError={isError}
                error={(error as AxiosBaseQueryError)?.data?.errorMessage ?? []}
                data={null}
              />
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
                disabled={
                  (providers?.length || 0) === 0 ||
                  isProjectAdding ||
                  isSiteLimitReached
                }
              >
                {isSiteLimitReached
                  ? tAddSite("limit_reached")
                  : tAddSite("create_site")}
              </Button>
            </DialogFooter>
          ) : null}
        </DialogContent>
      </Dialog>

      <UpgradeDialog
        open={showUpgradeDialog}
        onOpenChange={setShowUpgradeDialog}
        contextKey="gitlab"
      />

      <AddOrg
        open={showAddOrg}
        onOpenChange={setShowAddOrg}
        className="hidden"
      />

      <UpgradeDialog
        open={showUpgradeOrg}
        onOpenChange={setShowUpgradeOrg}
        contextKey="org_limit"
      />
    </>
  );
}
