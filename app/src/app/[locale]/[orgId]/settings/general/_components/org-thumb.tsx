"use client";

import { BucketImageUpload } from "@/components/bucket-image-upload";
import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from "@/components/ui/card";
import { IS_DEMO } from "@/lib/constant";
import { useUpdateOrgMutation } from "@/redux/features/orgs/org-api";
import { TOrg } from "@/redux/features/orgs/type";
import { useTransition } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

export default function OrgThumb(org: TOrg & { canUpdate?: boolean }) {
  const { org_name, org_image, org_id } = org;
  const canUpdate = org.canUpdate ?? true;
  const [isPending, startTransition] = useTransition();

  const [updateOrg] = useUpdateOrgMutation();
  const tOrgGeneralThumb = useTranslations("org.general.thumb");

  const onUploadSuccess = async (imageUrl: string) => {
    if (!canUpdate) return;

    if (IS_DEMO) {
      toast.error(tOrgGeneralThumb("demo_error"));
      return;
    }

    startTransition(async () => {
      await updateOrg({
        org_id: org_id,
        org_name: org_name,
        org_image: imageUrl,
      }).unwrap();
      toast.success(tOrgGeneralThumb("success"));
    });
  };

  return (
    <>
      <Card>
        <CardContent className="flex flex-col-reverse justify-between gap-2 sm:flex-row sm:gap-4">
          <div className="space-y-2.5">
            <CardTitle className="flex items-center text-lg">
              {tOrgGeneralThumb("title")}
            </CardTitle>
            <CardDescription>{tOrgGeneralThumb("description")}</CardDescription>
          </div>
          <BucketImageUpload
            usedFor="org"
            folder="sitepins/orgs"
            defaultImage={org_image}
            defaultLabel={org_name?.charAt(0)}
            onUploadSuccess={onUploadSuccess}
            altText={org_name || "Organization"}
            size="lg"
            isDisabled={IS_DEMO || isPending || !canUpdate}
          />
        </CardContent>
      </Card>
    </>
  );
}
