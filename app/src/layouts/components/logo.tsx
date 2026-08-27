"use client";

import useMounted from "@/hooks/use-mounted";
import config from "@/lib/config";
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
  const {
    logo,
    logo_darkmode,
    logo_width,
    logo_height,
    logo_text,
    title,
  }: {
    logo: string;
    logo_darkmode?: string;
    logo_width: string;
    logo_height: string;
    logo_text: string;
    title: string;
  } = config.site;

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
