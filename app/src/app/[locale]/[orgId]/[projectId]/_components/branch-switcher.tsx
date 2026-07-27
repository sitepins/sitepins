"use client";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UpgradeDialog } from "@/components/upgrade-dialog";
import { useGitProvider } from "@/hooks/use-git-provider";
import { useOwnerPlan } from "@/hooks/use-owner-plan";
import { isGitLabProvider } from "@/lib/utils/provider-checker";
import { updateConfig } from "@/redux/features/config/slice";
import { useAppDispatch } from "@/redux/store";
import {
  ChevronsUpDown,
  ExternalLink,
  GitBranch,
  Loader2,
  Lock,
  Plus,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { toast } from "sonner";

interface BranchSwitcherProps {
  project: any;
  config: any;
}

export function BranchSwitcher({ project, config }: BranchSwitcherProps) {
  const dispatch = useAppDispatch();
  const { useGitBranches, createGhBranch, createGlBranch, isBranchCreating } =
    useGitProvider();
  const {
    data: branches = [],
    isLoading: isBranchesLoading,
    refetch,
  } = useGitBranches({ skip: !project?.project_id });

  const [open, setOpen] = useState(false);
  const [isBranchDialogOpen, setIsBranchDialogOpen] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const [showUpgradeOrg, setShowUpgradeOrg] = useState(false);

  const tProjectBranching = useTranslations("project.branching");
  const tCommon = useTranslations("common");
  const { canAccessProFeatures } = useOwnerPlan();

  const branchList = useMemo(() => {
    if (!branches) return [];
    return branches.map((b: any) => ({
      name: b.name,
    }));
  }, [branches]);

  const handleCreateBranch = async () => {
    if (!newBranchName.trim()) {
      toast.error(tProjectBranching("create.error.required"));
      return;
    }

    try {
      if (isGitLabProvider(project?.provider)) {
        await createGlBranch({
          id: project?.repository || "",
          branch: newBranchName,
          ref: config.branch,
        }).unwrap();
      } else {
        const currentBranchData = (branches as any)?.find(
          (b: any) => b.name === config.branch,
        );
        const baseSha = currentBranchData?.commit?.sha;

        if (!baseSha) {
          toast.error(tProjectBranching("create.error.sha"));
          return;
        }

        await createGhBranch({
          owner: config.owner,
          repo: config.repoName,
          ref: `refs/heads/${newBranchName}`,
          sha: baseSha,
        }).unwrap();
      }

      toast.success(
        tProjectBranching("create.success", { name: newBranchName }),
      );
      dispatch(updateConfig({ branch: newBranchName }));
      setIsBranchDialogOpen(false);
      setNewBranchName("");
      setOpen(false);
    } catch (error: any) {
      console.error("Branch Creation Error:", error);
      toast.error(
        error?.data?.message ||
          error?.message ||
          tProjectBranching("create.error.failed"),
      );
    }
  };

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="h-7 min-w-25 justify-between px-2 text-xs"
            disabled={isBranchesLoading}
          >
            <div className="flex items-center gap-2 truncate">
              <span className="truncate">{config.branch}</span>
            </div>
            <ChevronsUpDown className="ml-2 size-3 shrink-0 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="w-64 p-0"
          align={"center"}
          sideOffset={10}
        >
          <Command>
            <CommandInput
              placeholder={tProjectBranching("switcher.placeholder")}
            />
            <CommandList>
              <CommandEmpty>
                {tProjectBranching("switcher.no_results")}
              </CommandEmpty>
              {branches && (
                <CommandGroup>
                  {branchList.map((branch: any) => (
                    <CommandItem
                      key={branch.name}
                      value={branch.name}
                      checked={config.branch === branch.name}
                      onSelect={(currentValue) => {
                        if (
                          !canAccessProFeatures &&
                          currentValue !== config.branch
                        ) {
                          setShowUpgradeOrg(true);
                          return;
                        }
                        dispatch(updateConfig({ branch: currentValue }));
                        setOpen(false);
                      }}
                    >
                      <div className="flex flex-1 items-center justify-between">
                        <div className="flex items-center gap-2">
                          <GitBranch className="text-muted-foreground size-3.5 opacity-60" />
                          {branch.name}
                          {project?.branch === branch.name && (
                            <span className="text-muted-foreground ml-2 text-xs">
                              ({tProjectBranching("switcher.default")})
                            </span>
                          )}
                        </div>
                        {!canAccessProFeatures &&
                          config.branch !== branch.name && (
                            <Lock className="text-muted-foreground size-3" />
                          )}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
            <CommandSeparator />
            <CommandGroup className="flex-none">
              <CommandItem
                onSelect={() => {
                  if (!canAccessProFeatures) {
                    setShowUpgradeOrg(true);
                    return;
                  }
                  setIsBranchDialogOpen(true);
                }}
              >
                <div className="flex w-full items-center justify-between">
                  <div className="flex items-center">
                    <Plus className="mr-2 size-4" />
                    {tProjectBranching("switcher.create_new")}
                  </div>
                  {!canAccessProFeatures && (
                    <Lock className="text-muted-foreground size-3" />
                  )}
                </div>
              </CommandItem>
            </CommandGroup>
          </Command>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={isBranchDialogOpen} onOpenChange={setIsBranchDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tProjectBranching("create.title")}</DialogTitle>
            <DialogDescription>
              {tProjectBranching.rich("create.desc", {
                branch: (chunks) => (
                  <span className="bg-muted rounded px-1 py-0.5 font-mono text-xs">
                    {chunks}
                  </span>
                ),
                branchName: config.branch,
              })}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="branchName">
                {tProjectBranching("create.label")}
              </Label>
              <Input
                id="branchName"
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                placeholder={tProjectBranching("create.placeholder")}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsBranchDialogOpen(false)}
              disabled={isBranchCreating}
            >
              {tCommon("actions.cancel")}
            </Button>
            <Button onClick={handleCreateBranch} disabled={isBranchCreating}>
              {isBranchCreating && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              {tProjectBranching("create.submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <a
        href={
          isGitLabProvider(project?.provider)
            ? `https://gitlab.com/${project.repository}/-/tree/${config.branch}`
            : `https://github.com/${config.owner}/${config.repoName}/tree/${config.branch}`
        }
        target="_blank"
        className="text-muted-foreground hover:text-foreground inline-flex items-center justify-center rounded-md p-1 transition-colors"
      >
        <ExternalLink className="size-3" />
      </a>

      <UpgradeDialog
        open={showUpgradeOrg}
        onOpenChange={setShowUpgradeOrg}
        contextKey="branching"
      />
    </div>
  );
}
