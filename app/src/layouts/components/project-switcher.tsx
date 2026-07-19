"use client";

import Avatar from "@/components/avatar";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils/cn";
import { selectConfig } from "@/redux/features/config/slice";
import { TProject } from "@/redux/features/project/type";
import { useAppSelector } from "@/redux/store";
import { ChevronsUpDown, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import AddSite from "./add-site";

interface ProjectSwitcherProps {
  projects: TProject[];
  currentProject?: TProject;
  orgId: string;
  className?: string;
}

export default function ProjectSwitcher({
  projects,
  currentProject,
  orgId,
  className,
}: ProjectSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isAddSiteModalOpen, setAddSiteModalOpen] = useState(false);
  const { branch } = useAppSelector(selectConfig);
  const tDashboardSwitcher = useTranslations("dashboard.switcher");
  const router = useRouter();

  return (
    <div
      className={cn(
        "group flex items-center justify-between gap-0 rounded-lg px-0 transition-colors md:gap-1 md:px-4",
        className,
      )}
    >
      <Link
        href={
          currentProject
            ? `/org-${orgId}/${currentProject.project_id}`
            : `/org-${orgId}`
        }
        className="flex flex-1 items-center gap-1 overflow-hidden text-left md:gap-2"
      >
        {currentProject?.project_image || currentProject?.site_url ? (
          currentProject?.site_url && !currentProject?.project_image ? (
            <img
              className="size-8 rounded-full object-cover"
              src={`https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${currentProject?.site_url}&size=64`}
              alt={currentProject?.project_name}
              width={32}
              height={32}
            />
          ) : (
            <Avatar
              email=""
              site_url={currentProject?.site_url}
              src={currentProject?.project_image!}
              alt={currentProject?.project_name!}
              width={32}
              height={32}
              className="size-8 rounded-full object-cover"
              preview={false}
            />
          )
        ) : (
          <div className="bg-light text-primary flex size-8 items-center justify-center rounded-full font-semibold capitalize">
            {currentProject?.project_name?.[0] ?? "S"}
          </div>
        )}
        <div className="flex-1 overflow-hidden">
          <div className="text-text-dark max-w-45 min-w-0 truncate text-sm font-medium capitalize">
            {currentProject?.project_name ?? tDashboardSwitcher("default_site")}
          </div>
          {currentProject && branch && (
            <small className="text-muted-foreground block text-xs">
              {branch}
            </small>
          )}
        </div>
      </Link>

      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="basic"
            size="icon"
            className="hover:bg-background/50 size-8 flex-none"
          >
            <ChevronsUpDown className="text-foreground size-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-64 p-0" align="end" sideOffset={10}>
          <Command>
            <CommandInput
              className="pl-1"
              placeholder={tDashboardSwitcher("search")}
            />
            <CommandList>
              <CommandEmpty>{tDashboardSwitcher("not_found")}</CommandEmpty>
              <CommandGroup>
                {projects.map((p) => (
                  <CommandItem
                    key={p.project_id}
                    value={p.project_name}
                    checked={currentProject?.project_id === p.project_id}
                    onSelect={() => {
                      setIsOpen(false);
                      router.push(`/org-${p.org_id}/${p.project_id}`);
                    }}
                  >
                    <div className="flex flex-1 cursor-pointer items-center justify-between">
                      <div className="flex items-center gap-2">
                        {p.project_image || p.site_url ? (
                          p.site_url && !p.project_image ? (
                            <img
                              className="size-5 rounded object-cover"
                              src={`https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${p.site_url}&size=64`}
                              alt={p.project_name}
                              width={20}
                              height={20}
                            />
                          ) : (
                            <Avatar
                              email=""
                              site_url={p.site_url}
                              src={p.project_image!}
                              alt={p.project_name!}
                              width={20}
                              height={20}
                              className="size-5 rounded object-cover"
                              preview={false}
                            />
                          )
                        ) : (
                          <div className="bg-light text-primary flex size-5 items-center justify-center rounded text-[10px] font-semibold capitalize">
                            {p.project_name?.[0]}
                          </div>
                        )}
                        <span className="truncate text-sm font-medium capitalize">
                          {p.project_name}
                        </span>
                      </div>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
            <CommandSeparator />
            <CommandGroup className="flex-none">
              <CommandItem
                onSelect={() => {
                  setIsOpen(false);
                  setAddSiteModalOpen(true);
                }}
              >
                <div className="text-primary flex flex-1 items-center justify-start gap-2">
                  <Plus className="size-4" />
                  <span>{tDashboardSwitcher("add_new")}</span>
                </div>
              </CommandItem>
            </CommandGroup>
          </Command>
        </DropdownMenuContent>
      </DropdownMenu>

      <AddSite
        orgId={orgId ? `org-${orgId}` : undefined}
        open={isAddSiteModalOpen}
        onOpenChange={setAddSiteModalOpen}
      />
    </div>
  );
}
