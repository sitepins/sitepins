"use client";

import { BucketImageUpload } from "@/components/bucket-image-upload";
import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from "@/components/ui/card";
import { IS_DEMO } from "@/lib/constant";
import { useUpdateProjectMutation } from "@/redux/features/project/project-api";
import { TProject } from "@/redux/features/project/type";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

export default function ProjectThumb(
  project: TProject & { canUpdate?: boolean },
) {
  const { org_id, project_id, project_name, project_image, site_url } = project;

  const canUpdate = project.canUpdate ?? true;

  const [updateProject] = useUpdateProjectMutation();
  const tProjectSettingsGeneralThumb = useTranslations(
    "project-settings.general.thumb",
  );

  const onUploadSuccess = async (imageUrl: string) => {
    if (!canUpdate) return;

    if (IS_DEMO) {
      toast.error(tProjectSettingsGeneralThumb("demo_error"));
      return;
    }

    await updateProject({
      ...project,
      project_id: project_id,
      org_id: org_id,
      project_image: imageUrl,
    }).unwrap();

    toast.success(tProjectSettingsGeneralThumb("success"));
  };

  return (
    <>
      <Card>
        <CardContent className="flex flex-col-reverse gap-4 sm:flex-row sm:justify-between">
          <div className="space-y-2.5">
            <CardTitle>{tProjectSettingsGeneralThumb("title")}</CardTitle>
            <CardDescription>
              {tProjectSettingsGeneralThumb("description")}
            </CardDescription>
          </div>
          <BucketImageUpload
            usedFor="site"
            folder="sitepins/sites"
            defaultImage={project_image}
            defaultLabel={project_name?.charAt(0)}
            onUploadSuccess={onUploadSuccess}
            altText={project_name || "Project"}
            size="lg"
            isDisabled={IS_DEMO || !canUpdate}
            siteUrl={site_url}
          />
        </CardContent>
      </Card>
    </>
  );
}
