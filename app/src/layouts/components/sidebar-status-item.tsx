"use client";

import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useSystemStatus } from "@/hooks/use-system-status";
import { useTranslations } from "next-intl";
import Link from "next/link";

interface SidebarStatusItemProps {
  onClick?: () => void;
  className?: string;
}

export default function SidebarStatusItem({
  onClick,
  className,
}: SidebarStatusItemProps) {
  const systemStatus = useSystemStatus();
  const tCommon = useTranslations("common");

  const statusLabel =
    systemStatus.status === "loading"
      ? tCommon("status.checking")
      : systemStatus.status === "operational"
        ? tCommon("status.all_operational")
        : systemStatus.status === "degraded"
          ? tCommon("status.degraded")
          : tCommon("status.outage");

  const statusTextColor =
    systemStatus.status === "operational"
      ? "text-accent hover:opacity-90"
      : systemStatus.status === "degraded"
        ? "text-warning hover:opacity-90"
        : systemStatus.status === "outage"
          ? "text-destructive hover:opacity-90"
          : "text-muted-foreground hover:text-foreground";

  const statusDotColor =
    systemStatus.status === "operational"
      ? "bg-accent shadow-xs"
      : systemStatus.status === "degraded"
        ? "bg-warning shadow-xs"
        : systemStatus.status === "outage"
          ? "bg-destructive shadow-xs"
          : "bg-muted-foreground";

  return (
    <div className={`border-border/60 mt-1 border-t pt-1 ${className || ""}`}>
      <DropdownMenuItem asChild className="cursor-pointer px-3 py-1.5">
        <Link
          href={systemStatus.statusUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`flex w-full items-center justify-between transition-colors ${statusTextColor}`}
          onClick={onClick}
        >
          <span className="text-xs font-medium">{statusLabel}</span>
          <span className={`size-2 shrink-0 rounded-full ${statusDotColor}`} />
        </Link>
      </DropdownMenuItem>
    </div>
  );
}
