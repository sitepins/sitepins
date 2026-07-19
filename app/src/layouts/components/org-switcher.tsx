"use client";

import { useTranslations } from "next-intl";
import AddOrg from "@/components/add-org";
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
import { PlanLabel } from "@/components/plan-label";
import { UpgradeDialog } from "@/components/upgrade-dialog";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useOrgId } from "@/hooks/use-org-id";
import { authClient } from "@/lib/auth/auth-client";
import { PackageLimit } from "@/lib/limits";
import { cn } from "@/lib/utils/cn";
import { selectCurrentPackage } from "@/redux/features/plan/slice";
import type { TOrg } from "@/redux/features/orgs/type";
import { useAppSelector } from "@/redux/store";
import { ChevronsUpDown, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

export default function OrgSwitcher({
  orgs,
  isResponsive = true,
}: {
  orgs: TOrg[];
  isResponsive?: boolean;
}) {
  const { currentPackage } = useAppSelector(selectCurrentPackage);
  const tOrgSwitcher = useTranslations("org.switcher");
  const router = useRouter();

  // use hook to resolve effective/prefixed org ids
  const { effectiveOrgId } = useOrgId(orgs ?? []);
  const isMobile = useMediaQuery("(max-width: 767px)");

  const defaultOrgs = useMemo(() => {
    if (!orgs || orgs.length === 0) return undefined;
    return orgs.find((org) => org.org_id === effectiveOrgId) ?? orgs[0];
  }, [effectiveOrgId, orgs]);

  const [isOpen, setIsOpen] = useState(false);
  const [showAddOrg, setShowAddOrg] = useState(false);
  const [showUpgradeOrg, setShowUpgradeOrg] = useState(false);

  const { data: auth } = authClient.useSession();
  const userId = auth?.user?.user_id;

  // Check if user can add new org based on their package limit
  const canAddOrg = useMemo(() => {
    if (!currentPackage || !userId) return false;
    const limit =
      PackageLimit[currentPackage as keyof typeof PackageLimit]?.org_limit ?? 0;
    const ownOrgs =
      orgs?.filter(
        (org) => org.owner === userId && org.status !== "archived",
      ) || [];
    return (ownOrgs?.length ?? 0) < limit;
  }, [currentPackage, orgs, userId]);

  return (
    <>
      <div
        className={cn(
          "group flex w-full items-center justify-between rounded-lg transition-colors md:gap-1 md:px-4",
          isResponsive ? "gap-0 px-0" : "gap-1 px-2",
        )}
      >
        <Link
          href={defaultOrgs ? `/org-${defaultOrgs.org_id}` : "#"}
          className={cn(
            "flex flex-1 items-center overflow-hidden text-left md:gap-2",
            isResponsive ? "gap-1" : "gap-2",
          )}
          onClick={() => {
            if (defaultOrgs) {
              localStorage.setItem("last_working_org_id", defaultOrgs.org_id);
            }
          }}
        >
          {defaultOrgs && defaultOrgs.org_image ? (
            <Avatar
              email=""
              alt={defaultOrgs.org_name}
              src={defaultOrgs.org_image}
              width={32}
              height={32}
              className="size-8 rounded-full object-cover"
            />
          ) : (
            <span className="bg-background text-text-dark wrap-break-words flex size-8 flex-none items-center justify-center rounded-md capitalize">
              {defaultOrgs?.org_name ? defaultOrgs.org_name[0] : "O"}
            </span>
          )}
          <span
            className={cn(
              "flex-1 overflow-hidden",
              isResponsive ? "hidden md:block" : "block",
            )}
          >
            <span className="text-text-dark block truncate font-medium">
              {defaultOrgs?.org_name ?? tOrgSwitcher("default_org")}
            </span>
            <PlanLabel
              activePackage={
                defaultOrgs?.ownerData?.[0]?.active_package ?? currentPackage
              }
            />
          </span>
        </Link>

        <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              variant={"basic"}
              size="icon"
              className="hover:bg-background/50 size-8 flex-none"
            >
              <ChevronsUpDown className="text-foreground size-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-64 p-0"
            align={isResponsive && isMobile ? "center" : "end"}
            sideOffset={10}
          >
            <Command>
              <CommandInput placeholder={tOrgSwitcher("search")} />
              <CommandList>
                <CommandEmpty>{tOrgSwitcher("not_found")}</CommandEmpty>
                <CommandGroup>
                  {orgs.map((org) => (
                    <CommandItem
                      key={org.org_id}
                      value={org.org_name}
                      checked={defaultOrgs?.org_id === org.org_id}
                      onSelect={() => {
                        localStorage.setItem("last_working_org_id", org.org_id);
                        setIsOpen(false);
                        router.push(`/org-${org.org_id}`);
                      }}
                    >
                      <div className="flex flex-1 cursor-pointer items-center justify-between">
                        <div className="flex items-center gap-2">
                          {org.org_image ? (
                            <Avatar
                              email=""
                              alt={org.org_name}
                              src={org.org_image}
                              width={20}
                              height={20}
                              className="size-5 rounded object-cover"
                            />
                          ) : (
                            <div className="bg-light text-primary flex size-5 items-center justify-center rounded text-[10px] font-semibold capitalize">
                              {org.org_name[0]}
                            </div>
                          )}

                          <span className="truncate text-sm font-medium capitalize">
                            {org.org_name}
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
                    if (canAddOrg) {
                      setShowAddOrg(true);
                    } else {
                      setShowUpgradeOrg(true);
                    }
                  }}
                >
                  <div className="text-primary flex flex-1 cursor-pointer items-center justify-start gap-2">
                    <Plus className="size-4" />
                    <span className="text-sm font-medium">
                      {tOrgSwitcher("add_new")}
                    </span>
                  </div>
                </CommandItem>
              </CommandGroup>
            </Command>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

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
