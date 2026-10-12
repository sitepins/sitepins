"use client";

import useMounted from "@/hooks/use-mounted";
import {
  BRAND_LOGO,
  BRAND_LOGO_DARK,
  BRAND_LOGO_HEIGHT,
  BRAND_LOGO_TEXT,
  BRAND_LOGO_WIDTH,
  BRAND_NAME,
} from "@/lib/brand";
import { cn } from "@/lib/utils/cn";
import { useTheme } from "next-themes";
import Image from "next/image";
import Link from "next/link";

const Logo = ({
  src,
  link,
  className,
}: {
  src?: string;
  link?: string;
  className?: string;
}) => {
  const logo = BRAND_LOGO;
  const logo_darkmode = BRAND_LOGO_DARK;
  const logo_width = BRAND_LOGO_WIDTH;
  const logo_height = BRAND_LOGO_HEIGHT;
  const logo_text = BRAND_LOGO_TEXT;
  const title = BRAND_NAME;

  // Theme handling: prefer a dark-mode logo if available when theme is dark.
  const { theme, resolvedTheme } = useTheme();
  const mounted = useMounted();

  const resolvedLogo =
    mounted && (theme === "dark" || resolvedTheme === "dark")
      ? (logo_darkmode ?? logo)
      : logo;

  const logoPath = src ? src : resolvedLogo;

  return (
    <Link
      href={link || "/"}
      target={link && link.startsWith("http") ? "_blank" : "_self"}
      className={cn("relative inline-flex items-center", className)}
    >
      {logoPath ? (
        <>
          <Image
            width={Number(logo_width.replace("px", "")) * 2}
            height={Number(logo_height.replace("px", "")) * 2}
            src={logoPath}
            alt={title}
            priority
            className="block"
            style={{
              height: logo_height.replace("px", "") + "px",
              width: logo_width.replace("px", "") + "px",
            }}
          />
        </>
      ) : logo_text ? (
        logo_text
      ) : (
        title
      )}
    </Link>
  );
};

export default Logo;
