"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Settings } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useParams } from "next/navigation";

export default function ProjectArchived() {
  const tDashboardArchivedProject = useTranslations(
    "dashboard.archived_project",
  );
  const params = useParams();

  return (
    <Card className="border-destructive/20 bg-destructive/5 mt-6">
      <CardHeader>
        <CardTitle className="text-xl">
          {tDashboardArchivedProject("title")}
        </CardTitle>
        <CardDescription>
          {tDashboardArchivedProject("description")}
        </CardDescription>
      </CardHeader>
      <CardFooter>
        <Button className="w-full sm:w-fit" variant="default">
          <Link
            className="flex items-center gap-2"
            href={`/${params.orgId}/${params.projectId}/settings/general`}
          >
            <Settings className="size-4" />
            {tDashboardArchivedProject("open_settings")}
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
