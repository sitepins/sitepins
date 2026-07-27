"use client";

import useMounted from "@/hooks/use-mounted";
import config from "@/lib/config";
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
    logo_width: any;
    logo_height: any;
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
      className={`relative inline-block ${className}`}
    >
      {logoPath ? (
        <>
          <Image
            width={logo_width.replace("px", "") * 2}
            height={logo_height.replace("px", "") * 2}
            src={logoPath}
            alt={title}
            priority
            style={{
              height: logo_height.replace("px", "") + "px",
              width: logo_width.replace("px", "") + "px",
            }}
          />

          {/* <span className="bg-background absolute top-7.5 left-8.5 rounded-[3px] bg-linear-to-r from-[#5a77e3] to-[#64bdf7] px-1 py-0.5 text-[8px] font-bold text-[#fff] shadow">
            BETA
          </span> */}
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
