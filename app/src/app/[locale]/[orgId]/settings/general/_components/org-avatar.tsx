"use client";

import { BucketImageUpload } from "@/components/bucket-image-upload";
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { IS_DEMO } from "@/lib/constant";
import { useUpdateOrgMutation } from "@/redux/features/orgs/org-api";
import { TOrg } from "@/redux/features/orgs/type";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "@/components/ui/toast";

export default function OrgAvatar(org: TOrg & { canUpdate?: boolean }) {
  const { org_name, org_image, org_id } = org;
  const canUpdate = org.canUpdate ?? true;
  const [isPending, startTransition] = useTransition();

  const [updateOrg] = useUpdateOrgMutation();
  const tOrgAvatar = useTranslations("org.general.avatar");

  const onUploadSuccess = async (imageUrl: string) => {
    if (!canUpdate) return;

    if (IS_DEMO) {
      toast.error(tOrgAvatar("demo_error"));
      return;
    }

    startTransition(async () => {
      await updateOrg({
        org_id: org_id,
        org_name: org_name,
        org_image: imageUrl,
      }).unwrap();
      toast.success(tOrgAvatar("success"));
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{tOrgAvatar("title")}</CardTitle>
        <CardDescription>{tOrgAvatar("description")}</CardDescription>
        <CardAction>
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
        </CardAction>
      </CardHeader>
    </Card>
  );
}
