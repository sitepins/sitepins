"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Archive, Settings } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";

type Props = {
  variant?: "banner" | "full";
};

export default function OrgArchived({ variant = "banner" }: Props) {
  const params = useParams();
  const tOrgArchived = useTranslations("org-archived");

  if (variant === "full") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mx-auto flex max-w-105 flex-col items-center"
        >
          <div className="bg-destructive/10 mb-6 flex h-20 w-20 items-center justify-center rounded-full">
            <Archive className="text-destructive h-10 w-10" />
          </div>
          <h1 className="mb-3 text-3xl font-bold tracking-tight">
            {tOrgArchived("title")}
          </h1>
          <p className="text-muted-foreground mb-8 text-lg">
            {tOrgArchived("desc_full")}
          </p>
          <Button asChild variant="outline" size="lg" className="gap-2">
            <Link href={`/${params.orgId}/settings`}>
              <Settings className="size-4" />
              {tOrgArchived("org_settings")}
            </Link>
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <Card className="border-destructive/20 bg-destructive/5 mt-6">
      <CardHeader>
        <CardTitle className="text-xl">{tOrgArchived("title")}</CardTitle>
        <CardDescription>{tOrgArchived("desc_banner")}</CardDescription>
      </CardHeader>
      <CardFooter>
        <Button className="w-full sm:w-fit" variant="default">
          <Link
            className="flex items-center gap-2"
            href={`/${params.orgId}/settings`}
          >
            <Settings className="size-4" />
            {tOrgArchived("view_settings")}
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
