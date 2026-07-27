"use client";

import Avatar from "@/components/avatar";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { useGetProjectQuery } from "@/redux/features/project/project-api";
import { SearchIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";

export default function SearchPreview({
  title,
  description,
  date,
}: {
  title: string;
  description: string;
  date?: string;
}) {
  const tEditorSeo = useTranslations("editor.seo");
  const { projectId, orgId, file } = useParams() as {
    projectId: string;
    orgId: string;
    file: string[];
  };

  const { data: site } = useGetProjectQuery({
    projectId: projectId,
    orgId: orgId.slice(4),
  });

  const {
    project_name,
    project_image,
    site_url = "https://www.google.com",
  } = site || {};

  const lastSegment = file
    ? file[file.length - 1].replace(/\.[^/.]+$/, "")
    : "";
  const pageSlug = lastSegment ? ` › ${lastSegment}` : "";

  return (
    <Card className="border-border bg-background max-w-sm border p-4 shadow-sm transition-shadow hover:shadow-md">
      <CardHeader className="px-0 pt-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-normal">
          <SearchIcon className="size-4" />
          <span>{tEditorSeo("search_preview")}</span>
        </CardTitle>
      </CardHeader>
      <div className="space-y-2">
        {/* Project Info: Avatar and Name */}
        <div className="mb-4 flex items-center gap-2">
          <div className="size-6 flex-none">
            <Avatar
              email=""
              site_url={site_url}
              src={project_image!}
              alt={project_name || ""}
              width={30}
              height={30}
              className="rounded-full object-cover"
            />
          </div>
          <div className="flex min-w-0 flex-col">
            <span className="text-foreground truncate text-sm leading-none font-medium">
              {project_name || "Project Name"}
            </span>
            <div className="text-muted-foreground truncate text-[12px]">
              {site_url.replace(/^https?:\/\//, "")}
              {pageSlug}
            </div>
          </div>
        </div>

        {/* Title */}
        <h3 className="line-clamp-1 cursor-pointer text-base leading-tight font-medium hover:underline">
          {title || "Page Title"}
        </h3>

        {/* Date and description */}
        <div className="text-[14px] leading-[1.58] text-[#bdc1c6]">
          {date && (
            <span className="text-muted-foreground mr-1 font-normal">
              {date} —{" "}
            </span>
          )}
          <p>
            {description
              ? description.length > 160
                ? `${description.substring(0, 160)}...`
                : description
              : "Add a meta description by editing the description field."}
          </p>
        </div>
      </div>
    </Card>
  );
}
