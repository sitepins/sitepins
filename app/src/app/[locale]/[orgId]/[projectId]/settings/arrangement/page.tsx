"use client";

import { UpgradeCta } from "@/components/upgrade-cta";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useOwnerPlan } from "@/hooks/use-owner-plan";
import { BookOpen, Lightbulb, Shuffle, Star } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";
import Arrangements from "./_components/arrange-site";
import ArrangeSiteSkeleton from "./_components/arrange-site-skeleton";

function ArrangementHeaderSection({ isModified }: { isModified: boolean }) {
  const tProjectSettingsArrangement = useTranslations(
    "project-settings.arrangement",
  );
  return (
    <>
      <CardHeader>
        <CardTitle>{tProjectSettingsArrangement("title")}</CardTitle>
        <CardDescription>
          {tProjectSettingsArrangement("description")}
        </CardDescription>
      </CardHeader>
      <CardContent
        className={`p-4 md:p-6 ${isModified ? "hidden md:block" : ""}`}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <Star className="text-accent mt-1 size-5" />
              <div>
                <div className="font-semibold">
                  {tProjectSettingsArrangement(
                    "features.virtual_folders.title",
                  )}
                </div>
                <div className="text-muted-foreground text-sm">
                  {tProjectSettingsArrangement("features.virtual_folders.desc")}
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <BookOpen className="text-accent mt-1 size-5" />
              <div>
                <div className="font-semibold">
                  {tProjectSettingsArrangement(
                    "features.visual_headings.title",
                  )}
                </div>
                <div className="text-muted-foreground text-sm">
                  {tProjectSettingsArrangement("features.visual_headings.desc")}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <Shuffle className="text-accent mt-1 size-5" />
              <div>
                <div className="font-semibold">
                  {tProjectSettingsArrangement("features.drag_and_drop.title")}
                </div>
                <div className="text-muted-foreground text-sm">
                  {tProjectSettingsArrangement("features.drag_and_drop.desc")}
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Lightbulb className="text-accent mt-1 size-5" />
              <div>
                <div className="font-semibold">
                  {tProjectSettingsArrangement("features.glob_patterns.title")}
                </div>
                <div className="text-muted-foreground text-sm">
                  {tProjectSettingsArrangement("features.glob_patterns.desc")}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="border-border mt-6 mb-2 border-t" />
      </CardContent>
    </>
  );
}

export default function ArrangementPage() {
  const { canAccessPremiumFeatures, isLoading } = useOwnerPlan();
  const [isModified, setIsModified] = useState(false);
  const tProjectSettingsArrangement = useTranslations(
    "project-settings.arrangement",
  );
  return (
    <Card className="w-full overflow-hidden">
      <ArrangementHeaderSection isModified={isModified} />
      {isLoading ? (
        <ArrangeSiteSkeleton />
      ) : canAccessPremiumFeatures ? (
        <Arrangements setIsModified={setIsModified} />
      ) : (
        <CardContent className="pt-0 text-center">
          <UpgradeCta
            labelKey="arrangement"
            size="default"
          />
        </CardContent>
      )}
    </Card>
  );
}
