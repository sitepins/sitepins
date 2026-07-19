"use client";

import { fetchOgImageAction } from "@/actions/utils/fetch-og";

// Fetches the preview image for a project's site URL. The open-source build
// uses lightweight og:image extraction only. The hosted cloud edition
// overrides this module (project-preview-image.cloud.ts) with a full-page
// screenshot service for premium plans, falling back to og:image.

export type PreviewImageResult =
  | { success: true; data: string }
  | { success: false; error: string };

export async function fetchProjectPreviewImage(_params: {
  url: string;
  premium: boolean;
}): Promise<PreviewImageResult> {
  const res = await fetchOgImageAction(_params.url);
  if (res.success && res.url) {
    return { success: true, data: res.url };
  }
  return {
    success: false,
    error: (res as { error?: string })?.error || "No open graph image found",
  };
}
