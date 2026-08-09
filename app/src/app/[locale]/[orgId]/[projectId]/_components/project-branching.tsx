"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useGitProvider } from "@/hooks/use-git-provider";
import { logger } from "@/lib/logger";
import { errorMessageOr, errorStatus } from "@/lib/utils/error";
import {
  isGitHubProvider,
  isGitLabProvider,
} from "@/lib/utils/provider-checker";
import {
  findRequestForBranch,
  toPullRequestViews,
} from "@/redux/features/git/pull-request";
import { TRepoInfoView } from "@/redux/features/git/repo-info";
import {
  useCompareGitHubBranchQuery,
  useCreateGitHubPullRequestMutation,
  useGetGitHubPullRequestsQuery,
  useMergeGitHubPullRequestMutation,
} from "@/redux/features/github";
import {
  useCompareGitLabBranchQuery,
  useCreateGitLabMergeRequestMutation,
  useGetGitLabMergeRequestsQuery,
  useMergeGitLabMergeRequestMutation,
} from "@/redux/features/gitlab";
import { TProject } from "@/redux/features/project/type";
import { useAppDispatch } from "@/redux/store";
import { TConfig } from "@/types";
import {
  CheckCircle2,
  ExternalLink,
  GitPullRequest,
  Loader2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { ChangeEvent, useEffect, useState } from "react";
import { toast } from "sonner";

type ProjectBranchingProps = {
  project?: TProject;
  config: TConfig;
  repoInfo?: TRepoInfoView;
};

/**
 * Component to manage branch comparisons and PR/MR creation/merging.
 */
const ProjectBranching = ({
  project,
  config,
  repoInfo,
}: ProjectBranchingProps) => {
  const tProjectBranching = useTranslations("project.branching");
  const { provider } = useGitProvider();
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [prLink, setPrLink] = useState<string | null>(null);
  const _dispatch = useAppDispatch();

  const defaultBranch = repoInfo?.defaultBranch || "main";
  const currentBranch = config.branch;
  const isDefaultBranch = defaultBranch === currentBranch;

  // GitHub Compare
  const {
    data: ghCompare,
    isLoading: _isGhLoading,
    isFetching: isGhFetching,
    refetch: refetchGhCompare,
    error: ghCompareError,
  } = useCompareGitHubBranchQuery(
    {
      owner: config.owner,
      repo: config.repoName,
      base: defaultBranch,
      head: currentBranch,
    },
    {
      skip:
        !isGitHubProvider(provider) ||
        isDefaultBranch ||
        !config.owner ||
        !config.repoName,
    },
  );

  // GitLab Compare
  const {
    data: glCompare,
    isLoading: _isGlLoading,
    isFetching: isGlFetching,
    refetch: refetchGlCompare,
  } = useCompareGitLabBranchQuery(
    {
      id: project?.repository || "",
      from: defaultBranch,
      to: currentBranch,
    },
    {
      skip:
        !isGitLabProvider(provider) || isDefaultBranch || !project?.repository,
    },
  );

  // GitHub existing PRs
  const {
    data: ghPulls,
    refetch: refetchGhPulls,
    error: ghPullsError,
  } = useGetGitHubPullRequestsQuery(
    {
      owner: config.owner,
      repo: config.repoName,
      state: "open",
    },
    {
      skip:
        !isGitHubProvider(provider) ||
        isDefaultBranch ||
        !config.owner ||
        !config.repoName,
    },
  );

  // GitLab existing MRs
  const { data: glMergeRequests, refetch: refetchGlMergeRequests } =
    useGetGitLabMergeRequestsQuery(
      {
        id: project?.repository || "",
        source_branch: currentBranch,
        state: "opened",
      },
      {
        skip:
          !isGitLabProvider(provider) ||
          isDefaultBranch ||
          !project?.repository,
      },
    );

  // Incoming GitHub Pull Requests (when on default branch)
  const { data: incomingGhPulls, refetch: refetchIncomingGhPulls } =
    useGetGitHubPullRequestsQuery(
      {
        owner: config.owner,
        repo: config.repoName,
        base: defaultBranch,
        state: "open",
      },
      {
        skip:
          !isGitHubProvider(provider) ||
          !isDefaultBranch ||
          !config.owner ||
          !config.repoName,
      },
    );

  // Incoming GitLab Merge Requests (when on default branch)
  const { data: incomingGlMRs, refetch: refetchIncomingGlMRs } =
    useGetGitLabMergeRequestsQuery(
      {
        id: project?.repository || "",
        target_branch: defaultBranch,
        state: "opened",
      },
      {
        skip:
          !isGitLabProvider(provider) ||
          !isDefaultBranch ||
          !project?.repository,
      },
    );

  const [createGhPR, { isLoading: isGhCreating }] =
    useCreateGitHubPullRequestMutation();
  const [createGlMR, { isLoading: isGlCreating }] =
    useCreateGitLabMergeRequestMutation();

  const [mergeGhPR, { isLoading: isGhMerging }] =
    useMergeGitHubPullRequestMutation();
  const [mergeGlMR, { isLoading: isGlMerging }] =
    useMergeGitLabMergeRequestMutation();

  // We don't need branches here anymore if we remove handleCreateBranch

  const isCreating = isGhCreating || isGlCreating;
  const isMerging = isGhMerging || isGlMerging;
  const isSyncing = isGhFetching || isGlFetching;

  const existingPR = isGitHubProvider(provider)
    ? findRequestForBranch(ghPulls, currentBranch)
    : toPullRequestViews(glMergeRequests)[0];

  const incomingRequests = toPullRequestViews(
    isGitHubProvider(provider) ? incomingGhPulls : incomingGlMRs,
  );

  const existingPRLink = existingPR?.url;
  const requestLink = prLink || existingPRLink;

  const isAhead = isGitLabProvider(provider)
    ? (glCompare?.commits?.length || 0) > 0
    : (ghCompare?.ahead_by || 0) > 0;

  // Opening the dialog seeds a fresh title/description; the author edits from
  // there until it closes again.
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (wasOpen !== isOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      setTitle(
        tProjectBranching("merge_into", {
          head: currentBranch,
          base: defaultBranch,
        }),
      );
      setDescription("");
    }
  }

  // Focus-based refresh to capture external changes (e.g., terminal push)
  useEffect(() => {
    const handleFocus = () => {
      if (isGitHubProvider(provider)) {
        if (!isDefaultBranch) {
          refetchGhCompare();
          refetchGhPulls();
        } else {
          refetchIncomingGhPulls();
        }
      } else if (isGitLabProvider(provider)) {
        if (!isDefaultBranch) {
          refetchGlCompare();
          refetchGlMergeRequests();
        } else {
          refetchIncomingGlMRs();
        }
      }
    };

    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [
    provider,
    isDefaultBranch,
    refetchGhCompare,
    refetchGhPulls,
    refetchIncomingGhPulls,
    refetchGlCompare,
    refetchGlMergeRequests,
    refetchIncomingGlMRs,
  ]);

  const isPermissionError = (error: any) => {
    if (!error) return false;
    const message = errorMessageOr(error, "");
    return (
      message.includes("Resource not accessible by integration") ||
      errorStatus(error) === 403 ||
      error?.data?.status === 403 ||
      error?.data?.status === "403"
    );
  };

  const showPermissionToast = () => {
    let settingsUrl = "https://github.com/settings/installations";

    if (isGitHubProvider(provider) && repoInfo?.orgName) {
      settingsUrl = `https://github.com/organizations/${repoInfo.orgName}/settings/installations`;
    }

    toast.error(tProjectBranching("permission_error_title"), {
      description: tProjectBranching("permission_error_description"),
      duration: 10000,
      action: {
        label: tProjectBranching("review"),
        onClick: () => window.open(settingsUrl, "_blank"),
      },
    });
  };

  // Monitor background errors
  useEffect(() => {
    if (isGitHubProvider(provider)) {
      if (
        isPermissionError(ghCompareError) ||
        isPermissionError(ghPullsError)
      ) {
        showPermissionToast();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ghCompareError, ghPullsError, provider]);

  const handleCreatePR = async () => {
    try {
      if (isGitLabProvider(provider)) {
        const result = await createGlMR({
          id: project?.repository || "",
          source_branch: currentBranch,
          target_branch: defaultBranch,
          title,
          description,
        }).unwrap();
        setPrLink(result.web_url);
        toast.success(
          tProjectBranching("success_created", { type: "Merge Request" }),
        );
      } else {
        const result = await createGhPR({
          owner: config.owner,
          repo: config.repoName,
          title,
          body: description,
          head: currentBranch,
          base: defaultBranch,
        }).unwrap();
        setPrLink(result.html_url);
        toast.success(
          tProjectBranching("success_created", { type: "Pull Request" }),
        );
      }
      setIsOpen(false);
    } catch (error) {
      logger.error("PR Creation Error:", error);

      if (isPermissionError(error)) {
        showPermissionToast();
      } else {
        toast.error(
          errorMessageOr(
            error,
            tProjectBranching("error_create", { type: "Pull Request" }),
          ),
        );
      }
    }
  };

  const handleMerge = async (
    requestId: number | string,
    sourceBranch: string,
  ) => {
    try {
      if (isGitLabProvider(provider)) {
        await mergeGlMR({
          id: project?.repository || "",
          merge_request_iid: Number(requestId),
          should_remove_source_branch: true,
        }).unwrap();
        toast.success(
          tProjectBranching("success_merged", { branch: sourceBranch }),
        );
        // Force refetch to ensure UI updates immediately
        if (isDefaultBranch) {
          refetchIncomingGlMRs();
        } else {
          refetchGlMergeRequests();
        }
      } else {
        await mergeGhPR({
          owner: config.owner,
          repo: config.repoName,
          pull_number: Number(requestId),
        }).unwrap();
        toast.success(
          tProjectBranching("success_merged", { branch: sourceBranch }),
        );
        // Force refetch to ensure UI updates immediately
        if (isDefaultBranch) {
          refetchIncomingGhPulls();
        } else {
          refetchGhPulls();
        }
      }
    } catch (error) {
      if (isPermissionError(error)) {
        showPermissionToast();
      } else {
        toast.error(errorMessageOr(error, tProjectBranching("error_merge")));
      }
    }
  };

  if (!repoInfo) return null;

  return (
    <div className="space-y-4">
      {/* Incoming Requests Section (Only on default branch) */}
      {isDefaultBranch && incomingRequests && incomingRequests.length > 0 && (
        <div className="space-y-3">
          {incomingRequests.map((req) => {
            const reqId = req.id;
            const reqTitle = req.title;
            const reqBranch = req.sourceBranch;
            const reqUrl = req.url;

            return (
              <div
                key={reqId}
                className="bg-muted/30 border-border flex items-center justify-between rounded-lg border px-5 py-3"
              >
                <div className="flex items-center gap-3">
                  <div className="bg-primary/10 text-primary flex size-8 items-center justify-center rounded-full">
                    <GitPullRequest className="size-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-medium">
                      {tProjectBranching("incoming_request", {
                        provider: isGitLabProvider(provider) ? "Merge" : "Pull",
                      })}
                    </h4>
                    <p className="text-muted-foreground mt-1 text-xs leading-none">
                      <span className="text-foreground font-semibold">
                        {reqBranch}
                      </span>{" "}
                      &rarr; {defaultBranch} : {reqTitle}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    asChild
                    className="h-8 text-xs"
                  >
                    <Link
                      href={reqUrl}
                      target="_blank"
                      className="flex items-center gap-1"
                    >
                      {tProjectBranching("details")}{" "}
                      <ExternalLink className="size-3" />
                    </Link>
                  </Button>
                  <Button
                    size="sm"
                    className="h-8 border-none bg-emerald-600 text-xs text-white hover:bg-emerald-700"
                    onClick={() => handleMerge(reqId, reqBranch)}
                    disabled={isMerging}
                  >
                    {isMerging ? (
                      <Loader2 className="mr-1 size-3 animate-spin" />
                    ) : (
                      <CheckCircle2 className="mr-1 size-3" />
                    )}
                    {tProjectBranching("merge")}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Changes Detected / Branch Management Section */}
      {(isAhead || existingPR) && (
        <div className="bg-muted/30 border-border flex items-center justify-between rounded-lg border px-5 py-3">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 text-primary flex size-8 items-center justify-center rounded-full">
              <GitPullRequest className="size-4" />
            </div>
            <div>
              <h4 className="flex items-center text-sm font-medium">
                {tProjectBranching("changes_detected")}
                {isSyncing && (
                  <Loader2 className="ml-2 size-3 animate-spin opacity-50" />
                )}
              </h4>
              <p className="text-muted-foreground text-xs">
                {isDefaultBranch
                  ? `You are on the default branch: ${defaultBranch}`
                  : `${currentBranch} is ahead of ${defaultBranch}.`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {requestLink && (
              <Button
                variant="outline"
                size="sm"
                asChild
                className="h-8 text-xs"
              >
                <Link
                  href={requestLink}
                  target="_blank"
                  className="flex items-center gap-1"
                >
                  {tProjectBranching("view_request")}{" "}
                  <ExternalLink className="size-3" />
                </Link>
              </Button>
            )}

            {!existingPR && !prLink && isAhead && (
              <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="h-8 text-xs">
                    {tProjectBranching("create_request", {
                      provider: isGitLabProvider(provider) ? "Merge" : "Pull",
                    })}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>
                      {tProjectBranching("create_request", {
                        provider: isGitLabProvider(provider) ? "Merge" : "Pull",
                      })}
                    </DialogTitle>
                    <DialogDescription>
                      {tProjectBranching("merge_description", {
                        head: currentBranch,
                        base: defaultBranch,
                      })}
                    </DialogDescription>
                  </DialogHeader>

                  <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                      <Label htmlFor="title">
                        {tProjectBranching("title")}
                      </Label>
                      <Input
                        id="title"
                        value={title}
                        onChange={(e: ChangeEvent<HTMLInputElement>) =>
                          setTitle(e.target.value)
                        }
                        placeholder={tProjectBranching("placeholder_title")}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="description">
                        {tProjectBranching("description_optional")}
                      </Label>
                      <Textarea
                        id="description"
                        value={description}
                        onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                          setDescription(e.target.value)
                        }
                        placeholder={tProjectBranching(
                          "placeholder_description",
                        )}
                        rows={3}
                      />
                    </div>
                  </div>

                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setIsOpen(false)}
                      disabled={isCreating}
                    >
                      Cancel
                    </Button>
                    <Button onClick={handleCreatePR} disabled={isCreating}>
                      {isCreating && (
                        <Loader2 className="mr-2 size-4 animate-spin" />
                      )}
                      {tProjectBranching("create_request", { provider: "" })}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectBranching;
