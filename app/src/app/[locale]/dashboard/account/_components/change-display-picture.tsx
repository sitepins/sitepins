"use client";

import { BucketImageUpload } from "@/components/bucket-image-upload";
import FormError from "@/components/form-error";
import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from "@/components/ui/card";
import { authClient, Session } from "@/lib/auth/auth-client";
import { IS_DEMO } from "@/lib/constant";
import { BetterFetchError } from "better-auth/client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

export default function ChangeDisplayPicture({ auth }: { auth: Session }) {
  const [error, setError] = useState<
    (BetterFetchError & Record<string, any>) | null
  >(null);

  const [isPending, setIsPending] = useState(false);
  const { user } = auth;
  const router = useRouter();

  const tDashboardAccountPicture = useTranslations("dashboard.account.picture");
  const tProfile = useTranslations("dashboard.account.profile");

  const onUploadSuccess = async (imageUrl: string) => {
    if (IS_DEMO) {
      toast.error(tProfile("demo_error"));
      return;
    }

    setIsPending(true);

    await authClient.updateUser(
      {
        image: imageUrl,
      },
      {
        onResponse: () => setIsPending(false),
        onSuccess: () => {
          toast.success(tDashboardAccountPicture("success"));
          router.refresh();
        },
        onError: (ctx: { error: BetterFetchError }) => {
          toast.error(ctx.error.message || tDashboardAccountPicture("error"));
        },
      },
    );
  };

  return (
    <Card id="display-picture">
      <CardContent className="flex justify-between gap-4">
        <div className="space-y-2.5">
          <CardTitle>{tDashboardAccountPicture("title")}</CardTitle>
          <CardDescription>
            {tDashboardAccountPicture("description")}
          </CardDescription>
        </div>
        <div className="space-y-4">
          <BucketImageUpload
            usedFor="user"
            folder="sitepins/users"
            defaultImage={user.image || ""}
            defaultLabel={user.full_name?.charAt(0)}
            onUploadSuccess={onUploadSuccess}
            altText={user.full_name || "User"}
            size="lg"
            isDisabled={IS_DEMO || isPending}
            email={user.email}
          />

          {/* @ts-ignore */}
          <FormError error={error?.data?.errorMessage} />
        </div>
      </CardContent>
    </Card>
  );
}
