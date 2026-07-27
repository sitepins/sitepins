"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils/cn";
import { normalizePath } from "@/lib/utils/normalize-path";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

// Controlled accordion that auto-opens when active, but still allows manual toggle
export function FolderAccordion({
  index,
  isActive,
  className,
  trigger,
  children,
  triggerWrapperClassName,
  triggerClassName,
}: {
  index: number;
  isActive: boolean;
  className?: string;
  trigger: React.ReactNode;
  children: React.ReactNode;
  triggerWrapperClassName?: string;
  triggerClassName?: string;
}) {
  const [value, setValue] = useState(isActive ? `${index}` : "");

  useEffect(() => {
    if (isActive) setValue(`${index}`);
  }, [isActive, index]);

  return (
    <Accordion
      className={cn("relative", className)}
      type="single"
      collapsible
      value={value}
      onValueChange={setValue}
    >
      <AccordionItem value={`${index}`} className="border-0">
        {triggerWrapperClassName !== undefined ? (
          <div className={triggerWrapperClassName}>
            {trigger}
            <AccordionTrigger className={triggerClassName} />
          </div>
        ) : (
          <AccordionTrigger
            className={cn(
              "h-auto w-full items-center justify-start space-x-2 py-0 pr-2.5 text-sm hover:no-underline",
              triggerClassName,
            )}
          >
            {trigger}
          </AccordionTrigger>
        )}
        <AccordionContent>
          <ul>{children}</ul>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

export function useFolderActive(orgId: string, projectId: string) {
  const pathname = usePathname();

  const isFolderActive = (folderPath: string) => {
    const basePrefix = `/org-${orgId}/${projectId}/`;
    const pureFolderPath = normalizePath(folderPath).replace(/^content\//, "");

    let currentPurePath = pathname;
    for (const prefix of ["content/", "configs/", "code/"]) {
      if (pathname.startsWith(basePrefix + prefix)) {
        currentPurePath = pathname.replace(basePrefix + prefix, "");
        break;
      }
    }

    return (
      currentPurePath === pureFolderPath ||
      currentPurePath.startsWith(pureFolderPath + "/")
    );
  };

  return isFolderActive;
}
