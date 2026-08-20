import OrgSwitcher from "@/components/org-switcher";
import ProjectSwitcher from "@/components/project-switcher";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { getDirection } from "@/lib/i18n/direction";
import { cn } from "@/lib/utils/cn";
import { useGetOrgsQuery } from "@/redux/features/orgs/org-api";
import { useGetProjectsQuery } from "@/redux/features/project/project-api";
import { PanelLeft } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useParams, usePathname } from "next/navigation";
import path from "path";

export default function MobileHeader({
  children,
}: {
  children: React.ReactNode;
}) {
  const tSidebar = useTranslations("navigation.sidebar");
  const locale = useLocale();
  const params = useParams();
  const pathname = usePathname();
  const isRtl = getDirection(locale) === "rtl";

  const rawOrgId = params?.orgId as string;
  const orgId = rawOrgId?.startsWith("org-") ? rawOrgId.slice(4) : rawOrgId;
  const projectId = params?.projectId as string;

  const { data: orgs = [] } = useGetOrgsQuery();
  const { data: projects = [] } = useGetProjectsQuery(orgId!, {
    skip: !orgId,
  });

  const currentProject = projects.find((p) => p.project_id === projectId);

  // Visibility logic
  const isFilesLikeRoute =
    pathname.includes("/content/") ||
    pathname.includes("/configs/") ||
    pathname.includes("/code/");
  const hasFileExtension = Boolean(path.extname(pathname));

  return (
    <div
      className={cn(
        "bg-light border-b-border sticky inset-s-0 top-0 z-30 flex h-16 w-full items-center justify-between border-b px-4 xl:hidden",
        isFilesLikeRoute && hasFileExtension && "hidden",
      )}
    >
      <div className="flex w-12 flex-none items-center gap-2">
        <Sheet>
          <SheetTrigger asChild id="mobile-header-trigger">
            <Button type="button" size="icon" variant="ghost">
              <PanelLeft className="cn-rtl-flip size-6" />
            </Button>
          </SheetTrigger>
          <SheetContent
            className="w-70 max-w-70! p-0"
            side={isRtl ? "right" : "left"}
            showCloseButton={false}
          >
            <SheetHeader className="hidden">
              <SheetTitle>
                {tSidebar("sidebar_trigger_mobile.title")}
              </SheetTitle>
              <SheetDescription>
                {tSidebar("sidebar_trigger_mobile.description")}
              </SheetDescription>
            </SheetHeader>
            {children}
          </SheetContent>
        </Sheet>
      </div>

      <div className="flex items-center justify-center gap-2">
        {orgs.length > 0 && (
          <div className="max-w-50">
            <OrgSwitcher orgs={orgs} isResponsive={Boolean(projectId)} />
          </div>
        )}
        {orgId && currentProject && (
          <>
            <div className="bg-border h-4 w-px flex-none" />
            <ProjectSwitcher
              projects={projects}
              currentProject={currentProject}
              orgId={orgId}
            />
          </>
        )}
      </div>

      <div className="w-12 flex-none" />
    </div>
  );
}
