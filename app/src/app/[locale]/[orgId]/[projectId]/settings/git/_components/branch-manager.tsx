"use client";

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
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useGitProvider } from "@/hooks/use-git-provider";
import { selectConfig } from "@/redux/features/config/slice";
import {
  useGetProjectQuery,
  useUpdateGitConnectionMutation,
} from "@/redux/features/project/project-api";
import { GitBranch } from "lucide-react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useSelector } from "react-redux";
import { toast } from "sonner";

export default function BranchManager({ canUpdate }: { canUpdate?: boolean }) {
  const canUpdateSettings = canUpdate ?? true;
  const params = useParams();
  const projectId = params?.projectId as string;
  const orgId = params?.orgId as string;

  // Remove 'org-' prefix if present (backend expects ID without prefix)
  const orgIdSafe = orgId?.startsWith("org-") ? orgId.slice(4) : orgId;

  // Fetch current project data to ensure we have correct org_id
  const { data: project } = useGetProjectQuery(
    { projectId, orgId: orgIdSafe },
    { skip: !projectId || !orgIdSafe },
  );

  const config = useSelector(selectConfig);
  const tProjectSettingsGitBranch = useTranslations(
    "project-settings.git.branch",
  );
  const tCommon = useTranslations("common");
  const { branch, owner, repoName } = config;
  const isConnected = Boolean(owner && repoName);

  const [selectedBranch, setSelectedBranch] = useState(branch || "");
  const [isEditing, setIsEditing] = useState(false);

  const { useGitBranches } = useGitProvider();
  const { data: branches, isLoading: branchesLoading } = useGitBranches({
    skip: !isConnected,
  });

  const [updateGitConnection, { isLoading: isUpdating }] =
    useUpdateGitConnectionMutation();

  const handleUpdateBranch = async () => {
    if (!canUpdateSettings) return;
    if (!selectedBranch || selectedBranch === branch) {
      setIsEditing(false);
      return;
    }

    // Use org_id from project data if available, fallback to sanitized params
    const projectOrgId = project?.org_id || orgIdSafe;

    if (!projectId || !projectOrgId) {
      toast.error(tProjectSettingsGitBranch("error_missing_info"));
      console.error("Missing params:", { projectId, orgId: projectOrgId });
      return;
    }

    // Use repository and provider from project data or config
    const currentRepo =
      project?.repository ||
      (config.owner && config.repoName
        ? `${config.owner}/${config.repoName}`
        : "");
    const currentProvider = project?.provider || config.provider;

    if (!currentRepo) {
      toast.error(tProjectSettingsGitBranch("error_no_repo"));
      return;
    }

    try {
      // Use updateGitConnection which sends repository, branch and provider
      await updateGitConnection({
        project_id: projectId,
        org_id: projectOrgId,
        repository: currentRepo,
        branch: selectedBranch,
        provider: currentProvider as "Github" | "Gitlab",
      }).unwrap();

      toast.success(tProjectSettingsGitBranch("success_message"));
      setIsEditing(false);
    } catch (error: any) {
      console.error("Branch update error:", error);
      toast.error(
        error?.data?.message ||
          error?.message ||
          tProjectSettingsGitBranch("error_generic"),
      );
      // Reset to current branch on error
      setSelectedBranch(branch || "");
    }
  };

  const handleCancel = () => {
    setSelectedBranch(branch || "");
    setIsEditing(false);
  };

  // Don't render if no repo is connected
  if (!isConnected) {
    return null;
  }

  const branchList = branches?.map((b: any) => ({
    value: b.name,
    label: b.name,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{tProjectSettingsGitBranch("title")}</CardTitle>
        <CardDescription>
          {tProjectSettingsGitBranch("description")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!isEditing ? (
          <div className="border-border flex items-center justify-between rounded-lg border p-4">
            <div className="flex items-center space-x-3">
              <div className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-lg">
                <GitBranch className="size-5" />
              </div>
              <div>
                <p className="text-foreground text-sm">
                  {tProjectSettingsGitBranch("current_branch_label")}
                </p>
                <p className="text-primary font-medium">{branch}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-foreground text-sm font-medium">
                {tProjectSettingsGitBranch("select_branch_label")}
              </label>
              <Select
                value={selectedBranch}
                onValueChange={setSelectedBranch}
                disabled={!canUpdateSettings}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue
                    placeholder={
                      branchesLoading
                        ? tProjectSettingsGitBranch("loading_branches")
                        : tProjectSettingsGitBranch("placeholder")
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>
                      {tProjectSettingsGitBranch("branches_label")}
                    </SelectLabel>
                    {branchList?.map((branch) => (
                      <SelectItem key={branch.value} value={branch.value}>
                        {branch.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </CardContent>
      <CardFooter className="flex items-center gap-x-3">
        {!isEditing ? (
          <Button
            className="w-full sm:w-auto"
            variant="outline"
            onClick={() => setIsEditing(true)}
            disabled={!canUpdateSettings}
          >
            {tProjectSettingsGitBranch("change_branch_btn")}
          </Button>
        ) : (
          <>
            <Button
              onClick={handleUpdateBranch}
              isLoading={isUpdating}
              disabled={!canUpdateSettings || isUpdating || !selectedBranch}
            >
              {tProjectSettingsGitBranch("update_branch_btn")}
            </Button>
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={isUpdating || !canUpdateSettings}
            >
              {tCommon("actions.cancel")}
            </Button>
          </>
        )}
      </CardFooter>
    </Card>
  );
}
