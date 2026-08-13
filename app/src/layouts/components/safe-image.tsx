"use client";

import { useGitProvider } from "@/hooks/use-git-provider";
import { useInView } from "@/hooks/use-in-view";
import { isVideo } from "@/lib/utils/check-media-file";
import { cn } from "@/lib/utils/cn";
import { cleanMediaPath } from "@/lib/utils/common";
import {} from "@/lib/utils/provider-checker";
import { selectConfig } from "@/redux/features/config/slice";
import Image from "next/image";
import path from "path";
import {
  ComponentProps,
  forwardRef,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSelector } from "react-redux";

export const PLACEHOLDER_IMAGE = "/images/placeholder.png";
export const FALLBACK_IMAGE = "/images/fallback.png";

type NextImageProps = Omit<ComponentProps<typeof Image>, "src">;

type SafeImageProps = NextImageProps & {
  /** Git-relative path to the image */
  path?: string;
  /** Direct URL for the image (used if path is not provided or fails) */
  src?: string;
  /** Whether to lazy load the image when it enters the viewport */
  lazy?: boolean;
  /** Internal fetching state from parent (optional) */
  isFetching?: boolean;
  /** Render prop for custom image handling (e.g., video thumbnails) */
  renderContent?: (props: {
    src: string;
    isFetching: boolean;
    ref: React.RefObject<HTMLImageElement | null>;
  }) => React.ReactNode;
};

const SafeImage = forwardRef<HTMLImageElement, SafeImageProps>(
  (
    {
      path: filePath,
      src: directSrc,
      lazy = false,
      isFetching: externalIsFetching,
      className,
      alt = "Image",
      onLoad,
      onError,
      renderContent,
      ...props
    },
    ref,
  ) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const imageRef = useRef<HTMLImageElement>(null);
    useImperativeHandle(ref, () => imageRef.current!);

    const [isLoading, setLoading] = useState(!directSrc?.startsWith("data:"));
    const [isError, setError] = useState(false);

    const isInView = useInView(containerRef, { once: true });
    const config = useSelector(selectConfig);
    const { media } = config;
    const { useGitImage } = useGitProvider();

    const finalPath = filePath ? cleanMediaPath(media, filePath) : "";

    // Git Fetching Logic
    const shouldFetch = !!filePath && (lazy ? isInView : true);

    const {
      data: gitImage,
      isLoading: isGitLoading,
      error: gitError,
      isUninitialized: isGitUninitialized,
    } = useGitImage(finalPath, { skip: !shouldFetch });

    const isFetching =
      externalIsFetching ||
      (shouldFetch && (isGitLoading || isGitUninitialized));

    // Resolve Image Source
    const resolvedSrc = useMemo(() => {
      let src = directSrc || PLACEHOLDER_IMAGE;

      if (shouldFetch && !isGitLoading && !gitError && gitImage) {
        const { content, download_url: downloadUrl } = gitImage;

        if (content) {
          const ext = path.extname(filePath!).toLowerCase();
          let mimeType = ext.slice(1);
          if (ext === ".svg") mimeType = "svg+xml";
          else if (ext === ".jpg" || ext === ".jpeg") mimeType = "jpeg";

          const type = isVideo(filePath!) ? "video" : "image";
          src = `data:${type}/${mimeType};base64,${content}`;
        } else if (downloadUrl) {
          // Add a cache buster to the download URL to force browser refetch
          // We use the file's SHA as a stable, pure cache-buster value
          const separator = downloadUrl.includes("?") ? "&" : "?";
          src = gitImage.sha
            ? `${downloadUrl}${separator}v=${gitImage.sha}`
            : downloadUrl;
        }
      }
      return src;
    }, [directSrc, shouldFetch, isGitLoading, gitError, gitImage, filePath]);

    const finalSrc = isError
      ? FALLBACK_IMAGE
      : isFetching
        ? PLACEHOLDER_IMAGE
        : resolvedSrc;

    if (renderContent) {
      return (
        <div ref={containerRef} className="relative h-full w-full">
          {renderContent({
            src: finalSrc,
            isFetching,
            ref: imageRef,
          })}
        </div>
      );
    }

    return (
      <div ref={containerRef} className="relative h-full w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          {...props}
          ref={imageRef}
          src={finalSrc}
          alt={alt}
          sizes={
            props.sizes ||
            "(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          }
          className={cn(
            "absolute inset-0 inline h-full w-full object-contain duration-700 ease-in-out lg:group-hover:opacity-70",
            (isLoading ||
              isFetching ||
              (directSrc && finalSrc !== directSrc)) &&
              !isError
              ? "scale-100 blur-xl grayscale-0"
              : "blur-0 scale-100 grayscale-0",
            className,
          )}
          onLoad={(e) => {
            if (finalSrc !== PLACEHOLDER_IMAGE) {
              setLoading(false);
            }
            onLoad?.(e);
          }}
          onError={(e) => {
            setError(true);
            onError?.(e);
          }}
        />
      </div>
    );
  },
);

SafeImage.displayName = "SafeImage";

export default SafeImage;
