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
import { type TLocale } from "@/lib/i18n/routing";
import { cn } from "@/lib/utils/cn";
import { Globe } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useTransition } from "react";

type LanguageSwitcherProps = {
  compact?: boolean;
  userId?: string;
  className?: string;
};

export default function LanguageSwitcher({
  compact = false,
  userId: _userId,
  className,
}: LanguageSwitcherProps) {
  const tCommon = useTranslations("common");
  const locale = useLocale() as TLocale;
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const currentLanguageName = useMemo(() => {
    return languages.find((l) => l.code === locale)?.name || locale;
  }, [locale]);

  function onSelectChange(nextLocale: string) {
    startTransition(() => {
      document.cookie = `NEXT_LOCALE=${nextLocale};path=/;max-age=31536000`;
      router.replace(pathname, { locale: nextLocale as TLocale });
      router.refresh();
    });
  }

  return (
    <div
      className={cn(
        compact ? "flex shrink-0 items-center" : "flex flex-col gap-1.5",
        className,
      )}
    >
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
              ? "h-8 w-auto shrink-0 items-center gap-1.5 border-0 px-2 py-0 text-sm shadow-none focus:ring-0"
              : "w-full"
          }
          aria-label={tCommon("language")}
        >
          {compact ? (
            <Globe className="size-4 shrink-0" />
          ) : (
            <SelectValue placeholder={currentLanguageName} />
          )}
          {compact && (
            <span className="max-w-17.5 truncate text-xs leading-none font-medium sm:max-w-none">
              {currentLanguageName}
            </span>
          )}
        </SelectTrigger>
        <SelectContent position="popper" align="end">
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
