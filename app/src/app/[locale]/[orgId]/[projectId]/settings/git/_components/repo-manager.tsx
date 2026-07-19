"use client";

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
} from "@/components/ui/alert-dialog";
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
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDebounce } from "@/hooks/use-debounce";
import { useAllInstallationRepos } from "@/hooks/use-fetch-repos";
import { useGitAuth } from "@/hooks/use-git-auth";
import {
  isGitHubProvider,
  isGitLabProvider,
} from "@/lib/utils/provider-checker";
import { selectConfig } from "@/redux/features/config/slice";
import {
  useGetGitHubBranchesQuery,
  useGetGitHubSingleRepoQuery,
} from "@/redux/features/github";
import {
  useGetGitLabBranchesQuery,
  useGetGitLabSingleRepoQuery,
} from "@/redux/features/gitlab/gitlab-api";
import {
  useDisconnectGitRepoMutation,
  useGetProjectQuery,
  useUpdateGitConnectionMutation,
} from "@/redux/features/project/project-api";
import { formatDistanceToNow } from "date-fns";
import { ExternalLink, GitBranch, Loader2, Unplug } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { toast } from "sonner";

export default function RepoManager({ canUpdate }: { canUpdate?: boolean }) {
  const params = useParams();
  const projectId = params?.projectId as string;
  const orgId = params?.orgId as string;

  // Remove 'org-' prefix if present (backend expects ID without prefix)
  const orgIdSafe = orgId?.startsWith("org-") ? orgId.slice(4) : orgId;
  const canUpdateSettings = canUpdate ?? true;
  const tProjectSettingsGitRepo = useTranslations("project-settings.git.repo");
  const tCommon = useTranslations("common");

  const config = useSelector(selectConfig);
  const { owner, repoName, provider, token } = config;
  const isConnected = Boolean(repoName);

  // Local state for provider selection (defaults to config provider or Github)
  const [selectedProvider, setSelectedProvider] = useState<string>(
    provider || "Github",
  );
  const [selectedRepo, setSelectedRepo] = useState("");
  const [selectedBranch, setSelectedBranch] = useState("");
  const [repoOpen, setRepoOpen] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);

  // Authentication and configuration hook
  const {
    handleClick,
    selectedProvider: authProvider,
    isTokenChanged,
  } = useGitAuth({
    selectedProvider: selectedProvider as "Github" | "Gitlab",
  });

  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  // Fetch Repositories using useAllInstallationRepos (handles both providers and auth properly)
  const {
    repositories: allRepos,
    isLoading: isLoadingRepos,
    refetch: refetchRepos,
  } = useAllInstallationRepos({
    provider: selectedProvider,
    token: authProvider?.accessToken,
    search: debouncedSearchQuery,
  });

  const repoItems = useMemo(() => {
    return allRepos?.map((repo: any) => repo.full_name) || [];
  }, [allRepos]);

  // Fetch Branches for the selected repository
  const { data: ghBranches, isLoading: isGhBranchLoading } =
    useGetGitHubBranchesQuery(
      {
        owner: selectedRepo.split("/")[0],
        repo: selectedRepo.split("/")[1],
        token: authProvider?.accessToken,
      },
      {
        skip: !selectedRepo || !isGitHubProvider(selectedProvider),
        refetchOnMountOrArgChange: true,
      },
    );

  const selectedRepoDataForBranches = allRepos?.find(
    (r: any) =>
      r.full_name === selectedRepo || r.path_with_namespace === selectedRepo,
  );

  const { data: glBranches, isLoading: isGlBranchLoading } =
    useGetGitLabBranchesQuery(
      {
        id: selectedRepoDataForBranches?.id || selectedRepo,
        token: authProvider?.accessToken,
      },
      {
        skip: !selectedRepo || !isGitLabProvider(selectedProvider),
        refetchOnMountOrArgChange: true,
      },
    );

  const branches = isGitLabProvider(selectedProvider) ? glBranches : ghBranches;
  const isBranchLoading = isGitLabProvider(selectedProvider)
    ? isGlBranchLoading
    : isGhBranchLoading;

  // Set default selected branch when repo changes or branches load
  useEffect(() => {
    if (selectedRepo && branches?.length) {
      const repoData = allRepos?.find(
        (r: any) =>
          r.full_name === selectedRepo ||
          r.path_with_namespace === selectedRepo,
      );
      setSelectedBranch(repoData?.default_branch || branches[0]?.name || "");
    } else {
      setSelectedBranch("");
    }
  }, [selectedRepo, branches, allRepos]);

  // Sync local provider state with config provider when it changes (only if connected)
  useEffect(() => {
    if (provider && isConnected) {
      setSelectedProvider(provider);
    }
  }, [provider, isConnected]);

  const [disconnectGitRepo, { isLoading: isDisconnecting }] =
    useDisconnectGitRepoMutation();
  const [updateGitConnection, { isLoading: isConnecting }] =
    useUpdateGitConnectionMutation();

  // Fetch current project data to ensure we have correct org_id
  const { data: project } = useGetProjectQuery(
    { projectId, orgId: orgIdSafe },
    { skip: !projectId || !orgIdSafe },
  );

  // Refetch repos when token changes (e.g., after authentication flow)
  useEffect(() => {
    if (isTokenChanged) {
      refetchRepos();
    }
  }, [isTokenChanged, refetchRepos]);

  /* Redundant repos mapping removed */

  // Fetch current repo info for GitHub
  const { data: ghRepoData } = useGetGitHubSingleRepoQuery(
    { owner: owner, repo: repoName },
    {
      skip: !isGitHubProvider(provider) || !isConnected || !owner || !repoName,
    },
  );

  // Fetch current repo info for GitLab
  const { data: glProjectData } = useGetGitLabSingleRepoQuery(
    { projectId: `${owner}/${repoName}`, token },
    {
      skip: !isGitLabProvider(provider) || !isConnected || !owner || !repoName,
    },
  );

  const handleDisconnect = async () => {
    if (!canUpdateSettings) return;

    const projectOrgId = project?.org_id || orgIdSafe;

    if (!projectId || !projectOrgId) {
      toast.error(tProjectSettingsGitRepo("error_missing_info"));
      return;
    }

    try {
      await disconnectGitRepo({
        project_id: projectId,
        org_id: projectOrgId,
      }).unwrap();
      toast.success(tProjectSettingsGitRepo("success_disconnect"));
      setIsSelecting(true);
    } catch (error: any) {
      console.error("Disconnect error:", error);
      toast.error(
        error?.data?.message ||
          error?.message ||
          tProjectSettingsGitRepo("error_disconnect"),
      );
    }
  };

  const handleConnect = async () => {
    if (!canUpdateSettings) return;

    if (!selectedRepo || !selectedBranch) {
      toast.error(tProjectSettingsGitRepo("error_no_repo_branch"));
      return;
    }

    const projectOrgId = project?.org_id || orgIdSafe;

    if (!projectId || !projectOrgId) {
      toast.error(tProjectSettingsGitRepo("error_missing_info"));
      return;
    }

    try {
      await updateGitConnection({
        project_id: projectId,
        org_id: projectOrgId,
        repository: selectedRepo,
        branch: selectedBranch,
        provider: selectedProvider as "Github" | "Gitlab",
      }).unwrap();

      toast.success(tProjectSettingsGitRepo("success_connect"));
      setIsSelecting(false);
      setSelectedRepo("");
    } catch (error: any) {
      console.error("Connect error:", error);
      toast.error(
        error?.data?.message ||
          error?.message ||
          tProjectSettingsGitRepo("error_connect"),
      );
    }
  };

  /* Removed old logic */

  /* Removed old loading variable */

  const currentRepoData = isGitHubProvider(provider)
    ? ghRepoData
    : glProjectData;
  const createdAt = isGitHubProvider(provider)
    ? ghRepoData?.created_at
    : glProjectData?.created_at;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{tProjectSettingsGitRepo("title")}</CardTitle>
        <CardDescription>
          {isConnected
            ? tProjectSettingsGitRepo("description_connected")
            : tProjectSettingsGitRepo("description_disconnected")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isConnected && !isSelecting ? (
          <div className="border-border flex items-center justify-between rounded-lg border p-4">
            <div className="flex items-center space-x-3">
              <div className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-lg">
                <GitBranch className="size-5" />
              </div>
              <div>
                <p className="text-primary font-medium">
                  {owner}/{repoName}
                </p>
                {createdAt && (
                  <p className="text-muted-foreground text-sm">
                    {tProjectSettingsGitRepo("connected_at", {
                      time: formatDistanceToNow(new Date(createdAt), {
                        addSuffix: true,
                      }),
                    })}
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <Field>
              <FieldLabel htmlFor="provider">
                {tProjectSettingsGitRepo("provider_label")}
              </FieldLabel>
              <Select
                value={selectedProvider}
                onValueChange={(val) => {
                  setSelectedProvider(val);
                  setSelectedRepo(""); // Clear repo selection when provider changes
                }}
              >
                <SelectTrigger id="provider">
                  <SelectValue
                    placeholder={tProjectSettingsGitRepo(
                      "select_provider_placeholder",
                    )}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Github">Github</SelectItem>
                  <SelectItem value="Gitlab">Gitlab</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel htmlFor="repository">
                {tProjectSettingsGitRepo("select_repo_label")}
              </FieldLabel>
              <Combobox
                open={repoOpen}
                onOpenChange={setRepoOpen}
                value={selectedRepo}
                items={repoItems}
                onValueChange={(currentValue: string | null) => {
                  setSelectedRepo(currentValue ?? "");
                  setRepoOpen(false);
                }}
              >
                <ComboboxInput
                  placeholder={
                    isLoadingRepos
                      ? tProjectSettingsGitRepo("please_wait")
                      : selectedRepo ||
                        tProjectSettingsGitRepo("select_repo_placeholder")
                  }
                  disabled={!canUpdateSettings}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setSearchQuery(e.target.value)
                  }
                  isLoading={isLoadingRepos}
                />
                <ComboboxContent
                  align={"start"}
                  side={"bottom"}
                  sideOffset={4}
                  className="w-full"
                >
                  <ComboboxEmpty>
                    {isLoadingRepos
                      ? tProjectSettingsGitRepo("please_wait")
                      : tProjectSettingsGitRepo("no_repo_found")}
                  </ComboboxEmpty>
                  <ComboboxList>
                    {(fullName: string) => {
                      const repo = allRepos?.find(
                        (r: any) => r.full_name === fullName,
                      );
                      if (!repo) return null;
                      return (
                        <ComboboxItem
                          key={repo.full_name}
                          value={repo.full_name}
                          className="pl-4"
                        >
                          <div className="group flex max-w-full items-center gap-1">
                            <span className="text-nowrap opacity-50">
                              {repo.owner.login}/
                            </span>
                            <span className="truncate">{repo.name}</span>

                            <Link
                              href={repo.html_url}
                              target="_blank"
                              prefetch={false}
                              onClick={(e) => {
                                e.stopPropagation();
                              }}
                              className="hidden group-hover:block"
                            >
                              <ExternalLink className="size-4 shrink-0 opacity-50" />
                            </Link>
                          </div>
                        </ComboboxItem>
                      );
                    }}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>

              <FieldDescription className="flex items-center space-x-1 pt-2">
                <span className="text-muted-foreground text-xs">
                  {tProjectSettingsGitRepo("cant_see_repo")}
                </span>
                <Button
                  variant="link"
                  className="h-auto p-0 text-xs underline"
                  onClick={() => handleClick()}
                  disabled={!canUpdateSettings}
                >
                  {tProjectSettingsGitRepo("configure_on", {
                    provider: selectedProvider,
                  })}
                </Button>
              </FieldDescription>
            </Field>

            {selectedRepo && (
              <Field>
                <FieldLabel htmlFor="branch">
                  {tProjectSettingsGitRepo("branch_label")}
                </FieldLabel>
                <Select
                  value={selectedBranch}
                  onValueChange={setSelectedBranch}
                  disabled={
                    !canUpdateSettings || isBranchLoading || !selectedRepo
                  }
                >
                  <SelectTrigger id="branch">
                    <SelectValue
                      placeholder={
                        isBranchLoading ? (
                          <div className="relative inline-flex items-center justify-center">
                            <Loader2 className="absolute left-0 mr-1 inline-block size-4 animate-spin" />
                            <span className="pl-5">
                              {tProjectSettingsGitRepo("please_wait")}
                            </span>
                          </div>
                        ) : (
                          tProjectSettingsGitRepo("choose_branch_placeholder")
                        )
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {branches?.map((branch: any) => (
                      <SelectItem
                        key={branch.name}
                        value={branch.name}
                        className="text-sm"
                      >
                        {branch.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
          </div>
        )}
      </CardContent>
      <CardFooter className="flex items-center gap-x-3">
        {isConnected && !isSelecting ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                className="w-full sm:w-auto"
                variant="destructive"
                isLoading={isDisconnecting}
                disabled={isDisconnecting || !canUpdateSettings}
              >
                <Unplug className="mr-2 size-4" />
                {tProjectSettingsGitRepo("disconnect_btn")}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {tProjectSettingsGitRepo("disconnect_confirm_title")}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {tProjectSettingsGitRepo("disconnect_confirm_desc")}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>
                  {tCommon("actions.cancel")}
                </AlertDialogCancel>
                <AlertDialogAction onClick={handleDisconnect}>
                  {tProjectSettingsGitRepo("disconnect_btn")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          <>
            <Button
              onClick={handleConnect}
              isLoading={isConnecting}
              disabled={
                !canUpdateSettings ||
                isConnecting ||
                !selectedRepo ||
                !selectedBranch
              }
            >
              {tProjectSettingsGitRepo("connect_repo_btn")}
            </Button>
            {isSelecting && isConnected && (
              <Button
                variant="outline"
                onClick={() => setIsSelecting(false)}
                disabled={isConnecting || !canUpdateSettings}
              >
                {tCommon("actions.cancel")}
              </Button>
            )}
          </>
        )}
      </CardFooter>
    </Card>
  );
}
