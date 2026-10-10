"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useTranslations } from "next-intl";

export default function SidebarTriggerMobile() {
  const tNavigationSidebarSidebarTriggerMobile = useTranslations(
    "navigation.sidebar.sidebar_trigger_mobile",
  );

  return (
    <Card className="flex xl:hidden">
      <CardHeader className="border-border border-b">
        <CardTitle>{tNavigationSidebarSidebarTriggerMobile("title")}</CardTitle>
        <CardDescription>
          {tNavigationSidebarSidebarTriggerMobile("description")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p>{tNavigationSidebarSidebarTriggerMobile("message")}</p>
      </CardContent>
      <CardFooter>
        <Button
          className="w-full"
          type="button"
          variant="default"
          onClick={() => {
            const el = document.getElementById(
              "mobile-header-trigger",
            ) as HTMLButtonElement | null;
            if (el) el.click();
          }}
        >
          {tNavigationSidebarSidebarTriggerMobile("open_sidebar")}
        </Button>
      </CardFooter>
    </Card>
  );
}
