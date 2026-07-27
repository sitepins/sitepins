"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import languages from "@/config/languages.json";
import { usePathname, useRouter } from "@/lib/i18n/navigation";
import { type Locale } from "@/lib/i18n/routing";
import { Globe } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useTransition } from "react";

type LanguageSwitcherProps = {
  compact?: boolean;
  userId?: string;
};

export default function LanguageSwitcher({
  compact = false,
  userId,
}: LanguageSwitcherProps) {
  const tCommon = useTranslations("common");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const currentLanguageName = useMemo(() => {
    return languages.find((l) => l.code === locale)?.name || locale;
  }, [locale]);

  function onSelectChange(nextLocale: string) {
    startTransition(() => {
      document.cookie = `NEXT_LOCALE=${nextLocale};path=/;max-age=31536000`;
      router.replace(pathname, { locale: nextLocale as Locale });
      router.refresh();
    });
  }

  return (
    <div className={compact ? "" : "flex flex-col gap-1.5"}>
      {!compact && (
        <label className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
          <Globe className="size-3.5" />
          {tCommon("language")}
        </label>
      )}
      <Select
        value={locale}
        onValueChange={onSelectChange}
        disabled={isPending}
      >
        <SelectTrigger
          className={
            compact
              ? "h-8 w-auto gap-1.5 border-0 px-2 text-sm shadow-none"
              : "w-full"
          }
          aria-label={tCommon("language")}
        >
          {compact ? (
            <Globe className="size-4" />
          ) : (
            <SelectValue placeholder={currentLanguageName} />
          )}
          {compact && (
            <span className="text-xs font-medium">{currentLanguageName}</span>
          )}
        </SelectTrigger>
        <SelectContent position="popper">
          {languages.map((loc) => (
            <SelectItem key={loc.code} value={loc.code}>
              {loc.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
