"use client";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchOgImageAction } from "@/actions/utils/fetch-og";
import {
  clearOldLocalStoragePreviews,
  getCachedScreenshot,
  setCachedScreenshot,
} from "@/lib/utils/indexed-db";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

export type ProjectThumbProps = {
  project: any;
};

export function ProjectThumb({ project }: ProjectThumbProps) {
  const tDashboard = useTranslations("dashboard");
  const siteUrl = project?.site_url;

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Clean up legacy localStorage previews once on mount
  useEffect(() => {
    clearOldLocalStoragePreviews();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!siteUrl) {
        setImageUrl(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      const cacheKey = "preview_og_" + siteUrl;

      const cached = await getCachedScreenshot(cacheKey);
      if (cached) {
        if (!cancelled) {
          setImageUrl(cached);
          setIsLoading(false);
        }
        return;
      }

      const normalizedUrl = siteUrl.startsWith("http")
        ? siteUrl
        : "https://" + siteUrl;

      try {
        const res = await fetchOgImageAction(normalizedUrl);
        if (res.success && res.url) {
          await setCachedScreenshot(cacheKey, res.url);
          if (!cancelled) setImageUrl(res.url);
        }
      } catch {
        // no og:image — the unavailable badge below covers it
      }

      if (!cancelled) setIsLoading(false);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [siteUrl]);

  if (isLoading) {
    return <Skeleton className="aspect-video w-full rounded-md" />;
  }

  if (!imageUrl) {
    return (
      <div className="border-border bg-muted/5 flex aspect-video w-full items-center justify-center rounded-md border">
        <Badge variant="outline" className="text-muted-foreground font-normal">
          {!siteUrl
            ? tDashboard("site_url_unavailable")
            : tDashboard("og_image_unavailable")}
        </Badge>
      </div>
    );
  }

  return (
    <div className="border-border relative w-full overflow-hidden rounded-md border">
      <img
        src={imageUrl}
        alt={`OG image of ${project?.project_name}`}
        className="w-full object-contain"
        // a URL that resolves but won't render is as good as no image
        onError={() => setImageUrl(null)}
      />
    </div>
  );
}
