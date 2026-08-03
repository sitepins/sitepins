"use client";

import Avatar from "@/components/avatar";
import { cn } from "@/lib/utils/cn";
import { getFaviconUrl } from "@/lib/utils/favicon";
import { useState } from "react";

// Every place a project thumbnail renders. Keeping the classes here means the
// image -> favicon -> initial fallback chain only exists once.
const VARIANTS = {
  // Org overview row: image fills the cell, favicon/initial sit centered in it.
  card: {
    size: 188,
    wrapper:
      "bg-light relative h-12 w-12 overflow-hidden rounded-full text-center lg:h-full lg:w-47 lg:rounded-none lg:px-10",
    image: "absolute inset-0 h-full w-full object-cover",
    favicon:
      "absolute top-1/2 left-1/2 size-12 -translate-x-1/2 -translate-y-1/2 rounded-full object-cover",
    fallback: "h3 absolute inset-0 bg-transparent font-bold",
  },
  // Project switcher trigger.
  trigger: {
    size: 32,
    wrapper: "",
    image: "size-8 rounded-full object-cover",
    favicon: "size-8 rounded-full object-cover",
    fallback: "size-8 rounded-full",
  },
  // Project switcher dropdown row.
  menu: {
    size: 20,
    wrapper: "",
    image: "size-5 rounded object-cover",
    favicon: "size-5 rounded object-cover",
    fallback: "size-5 rounded text-[10px]",
  },
} as const;

type ProjectIconProps = {
  variant: keyof typeof VARIANTS;
  projectName?: string;
  projectImage?: string;
  siteUrl?: string;
  /** Shown when the project has no name. */
  fallbackLabel?: string;
};

// Chain: uploaded image -> site favicon -> initial letter. The favicon proxy
// answers 404 with a 1x1 pixel when the lookup fails, so both onError and a
// zero-width load have to drop through to the initial.
export default function ProjectIcon({
  variant,
  projectName,
  projectImage,
  siteUrl,
  fallbackLabel,
}: ProjectIconProps) {
  // Track the URL that failed, not a boolean, so switching projects re-tries.
  const [failedFaviconUrl, setFailedFaviconUrl] = useState<string | null>(null);

  const styles = VARIANTS[variant];
  const faviconUrl = getFaviconUrl(siteUrl);

  let icon;

  if (projectImage) {
    icon = (
      <Avatar
        email=""
        site_url={siteUrl}
        src={projectImage}
        alt={projectName ?? ""}
        width={styles.size}
        height={styles.size}
        className={styles.image}
        preview={false}
      />
    );
  } else if (faviconUrl && faviconUrl !== failedFaviconUrl) {
    icon = (
      <img
        className={styles.favicon}
        src={faviconUrl}
        alt={projectName ?? ""}
        width={styles.size}
        height={styles.size}
        onError={() => setFailedFaviconUrl(faviconUrl)}
        onLoad={(e) => {
          if (e.currentTarget.naturalWidth <= 1)
            setFailedFaviconUrl(faviconUrl);
        }}
      />
    );
  } else {
    icon = (
      <div
        className={cn(
          "bg-light text-primary flex items-center justify-center font-semibold capitalize",
          styles.fallback,
        )}
      >
        {projectName?.[0] ?? fallbackLabel}
      </div>
    );
  }

  return styles.wrapper ? <div className={styles.wrapper}>{icon}</div> : icon;
}
