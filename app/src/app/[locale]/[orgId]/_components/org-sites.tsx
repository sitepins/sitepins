import ProjectIcon from "@/components/project-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { usePermission } from "@/hooks/use-permission";
import { ENUM_PERMISSIONS } from "@/lib/roles";
import { normalizeSiteUrl } from "@/lib/utils/favicon";
import { asFramework, Framework } from "@/lib/utils/framework-detector";
import { isGitLabProvider, TGitProvider } from "@/lib/utils/provider-checker";
import { TProject } from "@/redux/features/project/type";
import {
  SiAstro,
  SiGithub,
  SiGitlab,
  SiHugo,
  SiNextdotjs,
  SiTanstack,
} from "@icons-pack/react-simple-icons";
import {
  Ellipsis,
  ExternalLink,
  Globe,
  GitBranch,
  Lock,
  PenLine,
  Plus,
  Search,
  Settings,
  SquarePen,
} from "lucide-react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import Link from "next/link";
import type { ComponentType } from "react";

type TFrameworkMeta = {
  label: string;
  Icon: ComponentType<{ className?: string }>;
};

const FRAMEWORK_META: Record<NonNullable<Framework>, TFrameworkMeta> = {
  nextjs: { label: "Next.js", Icon: SiNextdotjs },
  astro: { label: "Astro", Icon: SiAstro },
  hugo: { label: "Hugo", Icon: SiHugo },
  hugo_examplesite: { label: "Hugo", Icon: SiHugo },
  tanstack: { label: "TanStack", Icon: SiTanstack },
};

const getRepoUrl = (
  provider: TGitProvider,
  repository: string,
  branch: string,
) =>
  isGitLabProvider(provider)
    ? `https://gitlab.com/${repository}/-/tree/${branch}`
    : `https://github.com/${repository}/tree/${branch}`;

const getHostname = (siteUrl: string) =>
  siteUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "");

function SiteLink({
  siteUrl,
  settingsHref,
  canManage,
}: {
  siteUrl?: string;
  settingsHref: string;
  canManage: boolean;
}) {
  const tOrgSites = useTranslations("org-sites");

  if (siteUrl) {
    return (
      <a
        href={normalizeSiteUrl(siteUrl)}
        target="_blank"
        rel="noopener noreferrer"
        dir="ltr"
        className="text-muted-foreground hover:text-primary relative z-10 inline-flex min-w-0 items-center gap-1.5 text-sm transition"
      >
        <Globe className="size-4 shrink-0" />
        <span className="truncate">{getHostname(siteUrl)}</span>
        <ExternalLink className="size-3.5 shrink-0" />
      </a>
    );
  }

  if (!canManage) return null;

  return (
    <Link
      href={settingsHref}
      className="text-muted-foreground hover:text-primary relative z-10 inline-flex items-center gap-1.5 text-sm transition"
    >
      <Plus className="size-4 shrink-0" />
      {tOrgSites("add_site_url")}
    </Link>
  );
}

function FrameworkLabel({ generator }: { generator?: string | null }) {
  const framework = asFramework(generator);
  if (!framework) return null;
  const { label, Icon } = FRAMEWORK_META[framework];

  return (
    <span className="text-muted-foreground inline-flex items-center gap-1.5 text-sm">
      <Icon className="size-4 shrink-0" />
      {label}
    </span>
  );
}

function LastActivity({ site }: { site: TProject }) {
  const tOrgSites = useTranslations("org-sites");
  const format = useFormatter();
  const now = useNow();

  const { last_edit, createdAt } = site;
  const date = last_edit?.createdAt ?? createdAt;
  if (!date) return null;

  const time = format.relativeTime(new Date(date), now);
  const label = last_edit
    ? tOrgSites("edited", { time })
    : tOrgSites("added", { time });

  const content = (
    <span className="text-muted-foreground inline-flex min-w-0 items-center gap-1.5 text-sm">
      <PenLine className="size-4 shrink-0" />
      <span className="truncate">{label}</span>
    </span>
  );

  if (!last_edit?.user_name) return content;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="relative z-10 inline-flex min-w-0 cursor-default">
          {content}
        </span>
      </TooltipTrigger>
      <TooltipContent className="text-xs">
        {tOrgSites("edited_by", { name: last_edit.user_name })}
      </TooltipContent>
    </Tooltip>
  );
}

function SiteActions({
  site,
  editorHref,
  settingsHref,
}: {
  site: TProject;
  editorHref: string;
  settingsHref: string;
}) {
  const tOrgSites = useTranslations("org-sites");
  const isGitLab = isGitLabProvider(site.provider);
  const RepoIcon = isGitLab ? SiGitlab : SiGithub;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          type="button"
          className="relative z-10"
          aria-label={tOrgSites("site_actions")}
        >
          <Ellipsis className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem asChild className="cursor-pointer">
          <Link href={editorHref}>
            <SquarePen className="size-4" />
            {tOrgSites("open_editor")}
          </Link>
        </DropdownMenuItem>
        {site.site_url ? (
          <DropdownMenuItem asChild className="cursor-pointer">
            <a
              href={normalizeSiteUrl(site.site_url)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Globe className="size-4" />
              {tOrgSites("visit_site")}
            </a>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem asChild className="cursor-pointer">
          <a
            href={getRepoUrl(site.provider, site.repository, site.branch)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <RepoIcon className="size-4" />
            {tOrgSites("view_repository", {
              provider: isGitLab ? "GitLab" : "GitHub",
            })}
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="cursor-pointer">
          <Link href={settingsHref}>
            <Settings className="size-4" />
            {tOrgSites("settings")}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SiteItem({
  site,
  orgId,
  canManage,
}: {
  site: TProject;
  orgId: string;
  canManage: boolean;
}) {
  const tOrgSites = useTranslations("org-sites");
  const {
    project_name,
    project_id,
    project_image,
    site_url,
    repository,
    branch,
    visibility,
    status,
    provider,
    generator,
  } = site;

  const editorHref = `/${orgId}/${project_id}`;
  const settingsHref = `${editorHref}/settings/general`;
  const RepoIcon = isGitLabProvider(provider) ? SiGitlab : SiGithub;

  return (
    <div className="group border-border hover:border-primary/40 hover:bg-muted/20 relative flex min-h-24 items-stretch gap-4 overflow-hidden rounded-lg border pe-2 transition lg:pe-4">
      <div className="flex shrink-0 items-center ps-4 lg:ps-0">
        <ProjectIcon
          variant="card"
          projectName={project_name}
          projectImage={project_image}
          siteUrl={site_url}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 py-4">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="min-w-0 truncate text-lg font-semibold">
            <Link
              href={editorHref}
              className="group-hover:text-primary focus-visible:after:ring-ring transition after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset"
            >
              {project_name}
            </Link>
          </h3>
          {status === "archived" ? (
            <Badge
              variant="destructive"
              size="sm"
              className="shrink-0 px-1.5 text-[11px]"
            >
              {tOrgSites("archived")}
            </Badge>
          ) : null}
        </div>

        <div className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-sm">
          <RepoIcon className="size-3.5 shrink-0" />
          <span dir="ltr" className="truncate">
            {repository}
          </span>
          <span aria-hidden>·</span>
          <GitBranch className="size-3.5 shrink-0" />
          <span dir="ltr" className="shrink-0">
            {branch}
          </span>
          {visibility === "private" ? (
            <Lock
              className="size-3.5 shrink-0"
              aria-label={tOrgSites("private")}
            />
          ) : null}
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 lg:hidden">
          <FrameworkLabel generator={generator} />
          <LastActivity site={site} />
        </div>
      </div>

      <div className="hidden w-28 shrink-0 items-center lg:flex">
        <FrameworkLabel generator={generator} />
      </div>

      <div className="hidden w-52 shrink-0 items-center lg:flex">
        <SiteLink
          siteUrl={site_url}
          settingsHref={settingsHref}
          canManage={canManage}
        />
      </div>

      <div className="hidden w-44 shrink-0 items-center lg:flex">
        <LastActivity site={site} />
      </div>

      <div className="flex shrink-0 items-center">
        <SiteActions
          site={site}
          editorHref={editorHref}
          settingsHref={settingsHref}
        />
      </div>
    </div>
  );
}

function EmptyState() {
  const tOrgSites = useTranslations("org-sites");
  return (
    <div className="flex h-full flex-col items-center justify-center space-y-4 py-12 text-center">
      <Search className="text-muted-foreground size-12 opacity-50" />
      <div>
        <h3 className="text-lg font-semibold">{tOrgSites("no_sites_found")}</h3>
        <p className="text-muted-foreground text-sm">
          {tOrgSites("try_adjusting")}
        </p>
      </div>
    </div>
  );
}

export default function OrgSites({
  sites,
  orgId,
}: {
  sites: TProject[];
  orgId: string;
}) {
  const canManage = usePermission(ENUM_PERMISSIONS.MANAGE_PROJECTS);

  if (sites.length === 0) return <EmptyState />;

  return (
    <div className="space-y-4">
      {sites.map((site) => (
        <SiteItem
          key={site.project_id}
          site={site}
          orgId={orgId}
          canManage={canManage}
        />
      ))}
    </div>
  );
}
