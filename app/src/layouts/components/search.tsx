"use client";

import { cn } from "@/lib/utils/cn";
import { Loader2, SearchIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Input } from "./ui/input";

export default function Search({
  disabled,
  className,
  onChange,
  value = "",
  isLoading,
  placeholder,
}: {
  disabled?: boolean;
  className?: string;
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  value?: string;
  isLoading?: boolean;
  placeholder?: string;
}) {
  const tCommon = useTranslations("common");
  const { replace } = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const params = useSearchParams();

  function handleSearch(term: string) {
    const params = new URLSearchParams(window.location.search);
    if (term) {
      params.delete("page");
      params.set("q", term);
    } else {
      params.delete("q");
    }

    startTransition(() => {
      replace(`${pathname}?${params.toString()}`);
    });
  }

  return (
    <div className={cn("relative", className)}>
      <label htmlFor="search" className="sr-only">
        {tCommon("search")}
      </label>
      <div className="relative h-full overflow-hidden">
        <div
          className={cn(
            "pointer-events-none absolute inset-s-px top-px flex h-full max-h-[calc(100%-2px)] w-10 items-center justify-center overflow-hidden rounded-ss-md rounded-es-md",
          )}
          aria-hidden="true"
        >
          {isLoading || isPending ? (
            <Loader2 className="text-muted-foreground size-4 animate-spin" />
          ) : (
            <SearchIcon
              className="text-muted-foreground size-4"
              aria-hidden="true"
            />
          )}
        </div>
        <Input
          type="text"
          name="search"
          {...(value && { value })}
          id="search"
          disabled={disabled}
          className="bg-background h-10 w-full ps-9 focus:outline-none focus-visible:ring-0"
          placeholder={placeholder || tCommon("search_placeholder")}
          spellCheck={false}
          defaultValue={params.get("q") || ""}
          onChange={(e) => {
            if (onChange) onChange(e);
            else handleSearch(e.target.value);
          }}
        />
      </div>
    </div>
  );
}
