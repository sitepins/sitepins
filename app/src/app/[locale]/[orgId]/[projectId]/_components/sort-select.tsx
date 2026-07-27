"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils/cn";
import { sorts } from "@/lib/utils/filter-options";
import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useTransition } from "react";

export const DEFAULT_SORT = "updated-desc" as const;

type SortSelectProps = {
  className?: string;
  isCodePath: boolean;
};

export function SortSelect({ className, isCodePath }: SortSelectProps) {
  const tDirectoryView = useTranslations("directory-view");
  const searchParams = useSearchParams();
  const { replace } = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const currentValue = searchParams.get("sort") || DEFAULT_SORT;

  const options = useMemo(() => {
    return sorts.map((definition) => {
      let label = tDirectoryView(`sort_options.${definition.labelKey as any}`);

      if (isCodePath && definition.field === "title") {
        label = label.replace("Title", tDirectoryView("headers.file_name"));
      }

      return {
        ...definition,
        label,
      };
    });
  }, [isCodePath, tDirectoryView]);

  const currentLabel =
    options.find((o) => o.value === currentValue)?.label ||
    options.find((o) => o.value === DEFAULT_SORT)?.label;

  return (
    <Select
      defaultValue={DEFAULT_SORT}
      value={currentValue}
      onValueChange={(value) => {
        startTransition(() => {
          const nextParams = new URLSearchParams(searchParams.toString());
          if (value === DEFAULT_SORT) {
            nextParams.delete("sort");
          } else {
            nextParams.set("sort", value);
          }
          nextParams.delete("page");
          replace(`${pathname}?${nextParams.toString()}`);
        });
      }}
      disabled={isPending}
    >
      <SelectTrigger
        className={cn(
          "bg-background w-full min-w-0 md:min-w-50 [&>span]:truncate",
          className,
        )}
        aria-label={tDirectoryView("sort_files")}
      >
        <SelectValue placeholder={currentLabel} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
