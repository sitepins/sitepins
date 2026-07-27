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
  useUpdateThemePreferenceMutation,
} from "@/redux/features/user-preference/user-preference-api";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { ThemePreferenceSkeleton } from "./theme-preference-skeleton";

interface ThemePreferenceProps {
  userId: string;
}

export default function ThemePreference({ userId }: ThemePreferenceProps) {
  const tDashboardPreferenceTheme = useTranslations(
    "dashboard.preference.theme",
  );
  const tCommon = useTranslations("common");
  const [updateTheme] = useUpdateThemePreferenceMutation();
  const { theme, setTheme } = useTheme();
  const { isLoading } = useGetUserPreferenceQuery(userId);

  const handleThemeChange = async (newTheme: string) => {
    setTheme(newTheme);
    try {
      await updateTheme({ userId, theme: newTheme }).unwrap();
      toast.success(tDashboardPreferenceTheme("updated_success"));
    } catch (error) {
      toast.error(tDashboardPreferenceTheme("updated_failed"));
    }
  };

  if (isLoading) {
    return <ThemePreferenceSkeleton />;
  }

  const optionClass = cn(
    "border-muted bg-popover hover:bg-primary/5 peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/10 flex cursor-pointer flex-col items-center justify-between rounded-xl border-2 p-4 transition-all",
  );

  return (
    <Card id="theme">
      <CardHeader>
        <CardTitle>{tDashboardPreferenceTheme("title")}</CardTitle>
        <CardDescription>
          {tDashboardPreferenceTheme("description")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <RadioGroup
          defaultValue={theme || "system"}
          onValueChange={handleThemeChange}
          className="grid grid-cols-3 gap-4"
        >
          <div>
            <RadioGroupItem
              value="system"
              id="system"
              className="peer sr-only"
            />
            <Label htmlFor="system" className={optionClass}>
              <Monitor className="mb-2 size-6" />
              <span className="font-medium">{tCommon("system")}</span>
            </Label>
          </div>
          <div>
            <RadioGroupItem value="light" id="light" className="peer sr-only" />
            <Label htmlFor="light" className={optionClass}>
              <Sun className="mb-2 size-6" />
              <span className="font-medium">{tCommon("light")}</span>
            </Label>
          </div>
          <div>
            <RadioGroupItem value="dark" id="dark" className="peer sr-only" />
            <Label htmlFor="dark" className={optionClass}>
              <Moon className="mb-2 size-6" />
              <span className="font-medium">{tCommon("dark")}</span>
            </Label>
          </div>
        </RadioGroup>
      </CardContent>
    </Card>
  );
}
