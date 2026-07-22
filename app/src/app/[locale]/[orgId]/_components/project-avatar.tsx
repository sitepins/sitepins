"use client";

import Avatar from "@/components/avatar";
import { getFaviconUrl } from "@/lib/utils/favicon";
import { useState } from "react";

interface ProjectAvatarProps {
  projectName: string;
  projectImage?: string;
  siteUrl?: string;
}

export function ProjectAvatar({
  projectName,
  projectImage,
  siteUrl,
}: ProjectAvatarProps) {
  const [faviconFailed, setFaviconFailed] = useState(false);

  const faviconUrl = getFaviconUrl(siteUrl);
  const showFavicon = Boolean(
    siteUrl && !projectImage && faviconUrl && !faviconFailed,
  );
  const showImage = Boolean(projectImage);

  return (
    <div className="bg-light relative h-12 w-12 overflow-hidden rounded-full text-center lg:h-full lg:w-47 lg:rounded-none lg:px-10">
      {showFavicon ? (
        <img
          className="size-12 rounded-full object-cover lg:absolute lg:top-1/2 lg:left-1/2 lg:-translate-x-1/2 lg:-translate-y-1/2"
          src={faviconUrl}
          alt={projectName}
          width={188}
          height={188}
          onError={() => setFaviconFailed(true)}
        />
      ) : showImage ? (
        <Avatar
          email=""
          site_url={siteUrl}
          src={projectImage!}
          alt={projectName}
          width={188}
          height={188}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <h3 className="text-primary flex h-full items-center justify-center capitalize">
          {projectName[0]}
        </h3>
      )}
    </div>
  );
}
