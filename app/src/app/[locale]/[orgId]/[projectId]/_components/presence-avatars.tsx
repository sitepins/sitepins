"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { type PresenceUser } from "@/hooks/use-presence";
import Avatar from "@/components/avatar";
import { cn } from "@/lib/utils/cn";

const MAX_VISIBLE = 3;

// Consistent color palette for avatar borders
const AVATAR_COLORS = [
  "#3b82f6", // blue
  "#ef4444", // red
  "#10b981", // green
  "#f59e0b", // amber
  "#8b5cf6", // purple
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#f97316", // orange
];

function getColorForUser(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export default function PresenceAvatars({ users }: { users: PresenceUser[] }) {
  if (users.length === 0) return null;

  const visible = users.slice(0, MAX_VISIBLE);
  const remaining = users.length - MAX_VISIBLE;

  return (
    <div className="flex items-center">
      <div className="flex -space-x-2">
        {visible.map((user) => {
          const color = getColorForUser(user.id);
          return (
            <Tooltip key={user.id}>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    "relative size-7 rounded-full ring-2 ring-white dark:ring-gray-900",
                    "cursor-default transition-transform duration-150 hover:z-10 hover:scale-110",
                  )}
                  style={{ borderColor: color }}
                >
                  <Avatar
                    src={user.image || ""}
                    email={user.email}
                    alt={user.name}
                    className="size-full rounded-full"
                    width={28}
                    height={28}
                  />
                  {/* Online pulse dot */}
                  <span
                    className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-white dark:border-gray-900"
                    style={{ backgroundColor: "#22c55e" }}
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {user.name || user.email}
              </TooltipContent>
            </Tooltip>
          );
        })}

        {remaining > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  "bg-muted text-muted-foreground flex size-7 items-center justify-center rounded-full text-xs font-medium",
                  "ring-2 ring-white dark:ring-gray-900",
                  "cursor-default",
                )}
              >
                +{remaining}
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {users
                .slice(MAX_VISIBLE)
                .map((u) => u.name || u.email)
                .join(", ")}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
