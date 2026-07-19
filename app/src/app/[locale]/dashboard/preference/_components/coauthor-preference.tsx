"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils/cn";
import {
  useGetUserPreferenceQuery,
  useUpdateCoAuthorPreferenceMutation,
} from "@/redux/features/user-preference/user-preference-api";
import { Bot, User } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CoAuthorPreferenceSkeleton } from "./coauthor-preference-skeleton";

interface CoAuthorPreferenceProps {
  userId: string;
}

export default function CoAuthorPreference({
  userId,
}: CoAuthorPreferenceProps) {
  const { data: preference, isLoading } = useGetUserPreferenceQuery(userId);
  const [updateCoAuthor] = useUpdateCoAuthorPreferenceMutation();
  const tDashboardPreferenceCoauthor = useTranslations(
    "dashboard.preference.coauthor",
  );

  const handleCoAuthorChange = async (enabled: boolean) => {
    try {
      await updateCoAuthor({ userId, impersonate: enabled }).unwrap();
      toast.success(tDashboardPreferenceCoauthor("updated"));
    } catch (error) {
      toast.error(tDashboardPreferenceCoauthor("error"));
    }
  };

  if (isLoading) {
    return <CoAuthorPreferenceSkeleton />;
  }

  const impersonate = preference?.impersonate ?? false;

  return (
    <Card id="coauthor">
      <CardHeader>
        <CardTitle className="text-2xl font-semibold tracking-tight">
          {tDashboardPreferenceCoauthor("title")}
        </CardTitle>
        <CardDescription>
          {tDashboardPreferenceCoauthor("description")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <RadioGroup
          value={impersonate ? "bot" : "user"}
          onValueChange={(value) => handleCoAuthorChange(value === "bot")}
          className="grid gap-4 md:grid-cols-2"
        >
          <Card
            className={cn(
              "hover:border-primary/5 relative cursor-pointer gap-0 py-0 transition-all",
              !impersonate &&
                "border-primary bg-primary/10 ring-primary ring-1",
            )}
            onClick={() => handleCoAuthorChange(false)}
          >
            <RadioGroupItem value="user" id="user" className="sr-only" />
            <CardContent>
              <div className="flex items-start justify-between">
                <div className="flex flex-col gap-3">
                  <div
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-lg border",
                      !impersonate
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted text-muted-foreground border-border",
                    )}
                  >
                    <User className="h-6 w-6" />
                  </div>
                  <div className="space-y-1">
                    <Label
                      htmlFor="user"
                      className="cursor-pointer text-lg font-semibold"
                    >
                      {tDashboardPreferenceCoauthor("as_you")}
                    </Label>
                    <p className="text-muted-foreground text-sm leading-relaxed">
                      {tDashboardPreferenceCoauthor("as_you_desc")}
                    </p>
                    <p className="text-muted-foreground mt-2 text-xs italic">
                      {tDashboardPreferenceCoauthor("as_you_fallback")}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card
            className={cn(
              "hover:border-primary/5 relative cursor-pointer gap-0 py-0 transition-all",
              impersonate && "border-primary bg-primary/10 ring-primary ring-1",
            )}
            onClick={() => handleCoAuthorChange(true)}
          >
            <RadioGroupItem value="bot" id="bot" className="sr-only" />
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex flex-col gap-3">
                  <div
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-lg border",
                      impersonate
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted text-muted-foreground border-border",
                    )}
                  >
                    <Bot className="h-6 w-6" />
                  </div>
                  <div className="space-y-1">
                    <Label
                      htmlFor="bot"
                      className="cursor-pointer text-lg font-semibold"
                    >
                      {tDashboardPreferenceCoauthor("as_bot")}
                    </Label>
                    <p className="text-muted-foreground text-sm leading-relaxed">
                      {tDashboardPreferenceCoauthor("as_bot_desc")}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </RadioGroup>
      </CardContent>
    </Card>
  );
}
