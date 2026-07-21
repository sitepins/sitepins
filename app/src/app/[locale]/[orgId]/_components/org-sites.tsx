import Avatar from "@/components/avatar";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { getFaviconUrl } from "@/lib/utils/favicon";
import { isGitLabProvider } from "@/lib/utils/provider-checker";
import { TProject } from "@/redux/features/project/type";
import { SiGithub, SiGitlab } from "@icons-pack/react-simple-icons";
import { Edit, ExternalLink, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";

interface ProjectAvatarProps {
  projectName: string;
  projectImage?: string;
  siteUrl?: string;
}

// Avatar component for the project/site
function ProjectAvatar({
  projectName,
  projectImage,
  siteUrl,
}: ProjectAvatarProps) {
  const hasImage = Boolean(projectImage || siteUrl);
  const shouldShowFavicon = Boolean(siteUrl && !projectImage);

  // Same-origin favicon URL (proxied) to avoid cross-origin CORS errors.
  const faviconUrl = getFaviconUrl(siteUrl);

  return (
    <div className="bg-light relative h-12 w-12 overflow-hidden rounded-full text-center lg:h-full lg:w-47 lg:rounded-none lg:px-10">
      {hasImage ? (
        shouldShowFavicon && faviconUrl ? (
          <img
            className="size-12 rounded-full object-cover lg:absolute lg:top-1/2 lg:left-1/2 lg:-translate-x-1/2 lg:-translate-y-1/2"
            src={faviconUrl}
            alt={projectName}
            width={188}
            height={188}
          />
        ) : (
          <Avatar
            email=""
            site_url={siteUrl}
            src={projectImage!}
            alt={projectName}
            width={188}
            height={188}
            className="absolute inset-0 h-full w-full object-cover"
          />
        )
      ) : (
        <h3 className="text-primary flex h-full items-center justify-center capitalize">
          {projectName[0]}
        </h3>
      )}
    </div>
  );
}

interface ProjectNameSectionProps {
  projectName: string;
  orgId: string;
  projectId: string;
  projectImage?: string;
  siteUrl?: string;
}

function ProjectNameSection({
  projectName,
  orgId,
  projectId,
  projectImage,
  siteUrl,
}: ProjectNameSectionProps) {
  return (
    <div className="group col-span-6 flex h-full items-center py-0! md:relative md:space-x-5">
      <ProjectAvatar
        projectName={projectName}
        projectImage={projectImage}
        siteUrl={siteUrl}
      />

      <h3 className="text-primary hidden text-lg md:block">
        {projectName}{" "}
        <Edit className="ml-2 inline-block size-4 opacity-0 transition group-hover:opacity-100" />
      </h3>

      <Link href={`/${orgId}/${projectId}`} className="absolute inset-0" />
    </div>
  );
}

// NOTE: visibility is shown inline next to repository (plain text) to keep
// the table compact — we no longer render a separate badge for visibility.

interface StatusBadgeProps {
  status: string;
}

function StatusBadge({ status }: StatusBadgeProps) {
  const tOrgSites = useTranslations("org-sites");
  const isArchived = status === "archived";
  return (
    <Badge variant={isArchived ? "destructive" : "success"}>
      {isArchived ? tOrgSites("archived") : tOrgSites("active")}
    </Badge>
  );
}

interface RepositoryLinkProps {
  repository: string;
  branch: string;
  provider: "Github" | "Gitlab";
  visibility?: string;
}

function RepositoryLink({
  repository,
  branch,
  provider,
  visibility,
}: RepositoryLinkProps) {
  const isGitLab = isGitLabProvider(provider);
  const tOrgSites = useTranslations("org-sites");
  const repoUrl = isGitLab
    ? `https://gitlab.com/${repository}/-/tree/${branch}`
    : `https://github.com/${repository}/tree/${branch}`;

  return (
    <Link
      target="_blank"
      href={repoUrl}
      className={buttonVariants({
        variant: "link",
        className:
          "text-secondary-foreground hover:text-primary relative z-30 line-clamp-1 hidden w-auto items-center justify-start p-0! text-left wrap-break-word break-all whitespace-normal md:inline-flex",
      })}
    >
      {isGitLab ? (
        <SiGitlab className="mr-1 inline-block size-5" />
      ) : (
        <SiGithub className="mr-1 inline-block size-5" />
      )}
      <span className="text-foreground line-clamp-1 flex-1 wrap-break-word break-all whitespace-normal">
        {repository}/tree/{branch}
      </span>
      {visibility ? (
        <span className="text-muted-foreground ml-2 hidden text-sm md:inline-block">
          (
          {visibility === "private"
            ? tOrgSites("private")
            : tOrgSites("public")}
          )
        </span>
      ) : null}
      <ExternalLink className="ml-1 inline-block size-4 translate-y-[-1.5px]" />
    </Link>
  );
}

interface SiteItemProps {
  site: TProject;
  orgId: string;
}

function SiteItem({ site, orgId }: SiteItemProps) {
  const {
    project_name,
    repository,
    branch,
    project_id,
    visibility,
    project_image,
    site_url,
    status,
    provider,
  } = site;

  return (
    <div className="border-border hover:bg-muted/20 relative flex grid-cols-12 items-center gap-x-3 overflow-hidden rounded-lg border px-2.5 transition *:py-8 md:grid lg:gap-x-0 lg:px-0">
      {/* Left section: Project name and avatar */}
      <ProjectNameSection
        projectName={project_name}
        orgId={orgId}
        projectId={project_id}
        projectImage={project_image}
        siteUrl={site_url}
      />

      {/* Middle section: Repository info (now includes visibility text) */}
      <div className="text-muted-foreground col-span-4 w-full text-left">
        <div className="flex flex-wrap justify-between gap-2 md:hidden">
          <h3 className="text-primary flex min-w-0 truncate text-sm sm:text-lg lg:hidden">
            {project_name}
          </h3>
          <span className="inline-flex items-center space-x-2 md:hidden">
            <StatusBadge status={status} />
          </span>
        </div>
        <div className="hidden md:block">
          <RepositoryLink
            repository={repository}
            branch={branch}
            provider={provider}
            visibility={visibility}
          />
        </div>
      </div>

      {/* Right section: Status */}
      <div className="col-span-2 mr-6 hidden md:flex md:items-center md:justify-end">
        <StatusBadge status={status} />
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

function TableHeader() {
  const tOrgSites = useTranslations("org-sites");
  return (
    <div className="bg-light text-text-dark hidden grid-cols-12 rounded-lg px-8 py-2.5 font-semibold md:grid">
      <div className="text-h6 col-span-6 flex">{tOrgSites("site_name")}</div>
      <div className="text-h6 col-span-4 text-left">
        {tOrgSites("repository")}
      </div>
      <div className="text-h6 col-span-2 text-right">{tOrgSites("status")}</div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function OrgSites({
  sites,
  orgId,
}: {
  sites: TProject[];
  orgId: string;
}) {
  const hasSites = sites.length > 0;

  return (
    <>
      {hasSites ? (
        <>
          <TableHeader />
          <div className="mt-6 space-y-4">
            {sites.map((site) => (
              <SiteItem key={site.project_id} site={site} orgId={orgId} />
            ))}
          </div>
        </>
      ) : (
        <EmptyState />
      )}
    </>
  );
}
