"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils/cn";
import { isDemoUrl } from "@/lib/utils/demo-urls";
import { slugify } from "@/lib/utils/text-converter";
import { selectConfig } from "@/redux/features/config/slice";
import { useUpdateProjectMutation } from "@/redux/features/project/project-api";
import {
  CheckCircle2,
  ChevronRight,
  Circle,
  ExternalLink,
  Rocket,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import { useSelector } from "react-redux";
import { ConfigForm } from "../settings/configure/_components/site-config-form";

export default function ProjectSetupSteps({
  project,
  projectLogQuery,
  refetchRepo,
}: {
  project: any;
  projectLogQuery: any;
  refetchRepo: () => void;
}) {
  const tProjectSetupSteps = useTranslations("project.setup-steps");
  const tCommon = useTranslations("common");
  const [isDeployModalOpen, setIsDeployModalOpen] = useState(false);
  const [manualUrl, setManualUrl] = useState("");
  const [updateProject, { isLoading: isUpdating }] = useUpdateProjectMutation();
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const config = useSelector(selectConfig);

  // Check if content folder is configured (Step 2)
  const isConfigured = !!config.content;

  // Check if any content has been edited (Step 3)
  const logs: any[] = projectLogQuery?.data?.logs ?? [];
  const hasContentEdits = logs.some((l: any) => {
    const fileType = String(l.file_type ?? "").toLowerCase();
    const action = String(l.action ?? "").toLowerCase();
    return (
      fileType === "content" && (action === "create" || action === "update")
    );
  });

  const isDemoProjectUrl = isDemoUrl(project?.site_url);

  const steps = [
    {
      id: "add-site",
      title: tProjectSetupSteps("steps.add_site.title"),
      description: tProjectSetupSteps("steps.add_site.description"),
      completed: true,
      onClick: () => {},
    },
    {
      id: "configure-project",
      title: tProjectSetupSteps("steps.configure_project.title"),
      description: tProjectSetupSteps("steps.configure_project.description"),
      completed: isConfigured,
      onClick: () => setIsConfigOpen(true),
    },
    {
      id: "edit-content",
      title: tProjectSetupSteps("steps.publish_content.title"),
      description: tProjectSetupSteps("steps.publish_content.description"),
      completed: hasContentEdits,
      onClick: () => {
        const isMobile = window.innerWidth < 1280;
        if (isMobile) {
          const trigger = document.getElementById("mobile-header-trigger");
          if (trigger) trigger.click();
        }

        // Add flash effect to sidebar content
        setTimeout(
          () => {
            const sidebarContents = document.querySelectorAll(
              ".sidebar-content-root",
            );
            sidebarContents.forEach((el) => {
              el.classList.add("flash-sidebar");
              setTimeout(() => {
                el.classList.remove("flash-sidebar");
              }, 2000);
            });
          },
          isMobile ? 500 : 0,
        ); // Wait for mobile sidebar to open
      },
    },
    {
      id: "deploy-site",
      title: tProjectSetupSteps("steps.deploy_site.title"),
      description: tProjectSetupSteps("steps.deploy_site.description"),
      completed: !!project?.site_url && !isDemoProjectUrl,
      onClick: () => {
        if (project?.site_url && !isDemoProjectUrl) {
          window.open(project.site_url, "_blank");
          return;
        }
        setIsDeployModalOpen(true);
      },
    },
  ];

  const completedCount = steps.filter((s) => s.completed).length;
  const progress = (completedCount / steps.length) * 100;

  if (completedCount === steps.length) {
    return null;
  }

  return (
    <>
      <Card>
        <CardHeader className="border-border border-b">
          <CardTitle>{tProjectSetupSteps("getting_started")}</CardTitle>
          <CardDescription>{tProjectSetupSteps("description")}</CardDescription>
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-medium">
                {tProjectSetupSteps("progress")}
              </span>
              <span className="text-muted-foreground">
                {tProjectSetupSteps("progress_count", {
                  completed: completedCount,
                  total: steps.length,
                })}
              </span>
            </div>
            <div className="bg-secondary h-2 w-full overflow-hidden rounded-full">
              <div
                className="bg-primary h-full transition-all duration-500 ease-in-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-border divide-y">
            {steps.map((step) => (
              <div
                key={step.id}
                onClick={step.onClick}
                className={cn(
                  "hover:bg-secondary/50 flex cursor-pointer items-center justify-between p-4 transition-colors",
                  step.completed && "opacity-70",
                )}
              >
                <div className="flex items-center gap-4">
                  {step.completed ? (
                    <CheckCircle2 className="text-success size-6" />
                  ) : (
                    <Circle className="text-muted-foreground size-6" />
                  )}
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <strong
                        className={cn(
                          "font-medium",
                          step.completed &&
                            "text-muted-foreground line-through",
                        )}
                      >
                        {step.title}
                      </strong>
                    </div>
                    <p className="text-muted-foreground text-sm">
                      {step.description}
                    </p>
                  </div>
                </div>
                <ChevronRight className="text-muted-foreground size-5" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Dialog open={isConfigOpen} onOpenChange={setIsConfigOpen}>
        <DialogContent className="w-full gap-y-4 sm:max-w-225">
          <DialogHeader>
            <DialogTitle>{tProjectSetupSteps("edit_config")}</DialogTitle>
          </DialogHeader>
          <ConfigForm onSaved={() => setIsConfigOpen(false)} />
        </DialogContent>
      </Dialog>

      <Dialog
        open={isDeployModalOpen}
        onOpenChange={(open) => {
          setIsDeployModalOpen(open);
          if (!open) {
            refetchRepo();
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{tProjectSetupSteps("deploy_to_vercel")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="space-y-4">
              <div className="border-border relative flex items-start gap-3 rounded-lg border p-3">
                <div className="bg-primary/10 flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold">
                  1
                </div>
                <div>
                  <h4 className="mb-2 text-base font-medium">
                    {tProjectSetupSteps("login_signup")}{" "}
                    <ExternalLink className="ml-1 inline-block size-4" />
                  </h4>
                  <p className="text-muted-foreground text-sm">
                    <Link
                      className="stretched-link"
                      href="https://vercel.com/login"
                      target="_blank"
                    >
                      {tProjectSetupSteps("create_account")}
                    </Link>{" "}
                    {tProjectSetupSteps("vercel_host")}
                  </p>
                </div>
              </div>
              <div className="border-border relative flex items-start gap-3 rounded-lg border p-3">
                <div className="bg-primary/10 flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold">
                  2
                </div>
                <div>
                  <h4 className="mb-2 text-base font-medium">
                    {tProjectSetupSteps("deploy_to_vercel")}{" "}
                    <Rocket className="ml-1 inline-block size-4" />
                  </h4>
                  <p className="text-muted-foreground text-sm">
                    <Link
                      className="stretched-link"
                      href={`https://vercel.com/new/import?repository-url=${encodeURIComponent(`https://github.com/${project?.repository}`)}&project-name=${encodeURIComponent(slugify(project?.project_name))}`}
                      target="_blank"
                    >
                      {tProjectSetupSteps("deploy_repo")}
                    </Link>{" "}
                    {tProjectSetupSteps("one_click")}
                  </p>
                </div>
              </div>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="border-border w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background text-muted-foreground px-2">
                  {tProjectSetupSteps("or")}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label>{tProjectSetupSteps("already_deployed")}</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="https://your-site-url.com"
                  value={manualUrl}
                  onChange={(e) => setManualUrl(e.target.value)}
                />
                <Button
                  disabled={!manualUrl || isUpdating}
                  onClick={() => {
                    updateProject({
                      project_id: project.project_id,
                      org_id: project.org_id,
                      site_url: manualUrl,
                    })
                      .unwrap()
                      .then(() => setIsDeployModalOpen(false));
                  }}
                >
                  {tCommon("actions.save")}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
