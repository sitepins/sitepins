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
import languages from "@/config/languages.json";
import { usePathname, useRouter } from "@/lib/i18n/navigation";
import { type Locale } from "@/lib/i18n/routing";
import { cn } from "@/lib/utils/cn";
import {
  useGetUserPreferenceQuery,
  useUpdateLanguagePreferenceMutation,
} from "@/redux/features/user-preference/user-preference-api";
import { Globe } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";
import { LanguagePreferenceSkeleton } from "./language-preference-skeleton";

export default function LanguagePreference({ userId }: { userId: string }) {
  const tDashboardPreferenceLanguage = useTranslations(
    "dashboard.preference.language",
  );
  const tCommon = useTranslations("common");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [updateLanguage] = useUpdateLanguagePreferenceMutation();
  const { isLoading } = useGetUserPreferenceQuery(userId);

  if (isLoading) {
    return <LanguagePreferenceSkeleton />;
  }

  function handleLanguageChange(nextLocale: string) {
    startTransition(async () => {
      try {
        await updateLanguage({ userId, language: nextLocale }).unwrap();
        // Update the NEXT_LOCALE cookie so middleware picks up the change
        // without needing to query the DB on the next request
        document.cookie = `NEXT_LOCALE=${nextLocale};path=/;max-age=31536000`;
        toast.success(
          tCommon("feedback.language_updated") || "Language updated",
        );
      } catch (error) {
        toast.error(
          tCommon("feedback.language_update_failed") ||
            "Failed to update language",
        );
      }
      router.replace(pathname, { locale: nextLocale as Locale });
      router.refresh();
    });
  }

  return (
    <Card id="language">
      <CardHeader>
        <CardTitle>{tDashboardPreferenceLanguage("title")}</CardTitle>
        <CardDescription>
          {tDashboardPreferenceLanguage("description")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <RadioGroup
          value={locale}
          onValueChange={handleLanguageChange}
          className="grid gap-4 gap-y-1 md:grid-cols-2 lg:grid-cols-3"
          disabled={isPending}
        >
          {languages.map((lang) => (
            <div key={lang.code}>
              <RadioGroupItem
                value={lang.code}
                id={lang.code}
                className="peer sr-only"
              />
              <Label
                htmlFor={lang.code}
                className={cn(
                  "border-muted bg-popover hover:bg-primary/5 peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/10 flex cursor-pointer items-center gap-2 rounded-xl border-2 p-4 transition-all",
                )}
              >
                <div
                  className={cn(
                    "bg-muted text-muted-foreground peer-data-[state=checked]:bg-primary peer-data-[state=checked]:text-primary-foreground flex h-9 w-9 items-center justify-center rounded-lg border transition-colors",
                  )}
                >
                  <Globe className="h-5 w-5" />
                </div>
                <span className="font-semibold">{lang.name}</span>
              </Label>
            </div>
          ))}
        </RadioGroup>
      </CardContent>
    </Card>
  );
}
