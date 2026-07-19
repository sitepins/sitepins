import { useEffect, useLayoutEffect, useState } from "react";

export type UseOSReturnValue = {
  os:
    | "unknown"
    | "macos"
    | "ios"
    | "windows"
    | "android"
    | "linux"
    | "chromeos";
  isDesktop: boolean;
  isMobile: boolean;
  isMac: boolean;
  isWindows: boolean;
  platform: "desktop" | "phone" | "unknown";
};

function isMacOS(userAgent: string): boolean {
  const macosPattern = /(Macintosh)|(MacIntel)|(MacPPC)|(Mac68K)/i;

  return macosPattern.test(userAgent);
}

function isIOS(userAgent: string): boolean {
  const iosPattern = /(iPhone)|(iPad)|(iPod)/i;

  return iosPattern.test(userAgent);
}

function isWindows(userAgent: string): boolean {
  const windowsPattern = /(Win32)|(Win64)|(Windows)|(WinCE)/i;

  return windowsPattern.test(userAgent);
}

function isAndroid(userAgent: string): boolean {
  const androidPattern = /Android/i;

  return androidPattern.test(userAgent);
}

function isLinux(userAgent: string): boolean {
  const linuxPattern = /Linux/i;

  return linuxPattern.test(userAgent);
}

function isChromeOS(userAgent: string): boolean {
  const chromePattern = /CrOS/i;
  return chromePattern.test(userAgent);
}

function getOS(): UseOSReturnValue["os"] {
  if (typeof window === "undefined") {
    return "unknown";
  }

  const { userAgent } = window.navigator;

  if (isIOS(userAgent) || (isMacOS(userAgent) && "ontouchend" in document)) {
    return "ios";
  }
  if (isMacOS(userAgent)) {
    return "macos";
  }
  if (isWindows(userAgent)) {
    return "windows";
  }
  if (isAndroid(userAgent)) {
    return "android";
  }
  if (isChromeOS(userAgent)) {
    return "chromeos";
  }
  if (isLinux(userAgent)) {
    return "linux";
  }

  return "unknown";
}

export interface UseOsOptions {
  getValueInEffect: boolean;
}

export function useOs(
  options: UseOsOptions = { getValueInEffect: true },
): UseOSReturnValue {
  const [value, setValue] = useState<UseOSReturnValue["os"]>(
    options.getValueInEffect ? "unknown" : getOS(),
  );

  useIsomorphicEffect(() => {
    if (options.getValueInEffect) {
      setValue(getOS);
    }
  }, []);

  const isDesktop =
    value === "macos" ||
    value === "windows" ||
    value === "linux" ||
    value === "chromeos";
  const isMobile = value === "ios" || value === "android";

  const isMac = value === "macos";
  const isWindows = value === "windows";

  const platform = isDesktop ? "desktop" : isMobile ? "phone" : "unknown";

  return {
    os: value,
    isDesktop,
    isMobile,
    platform,
    isMac,
    isWindows,
  };
}

// UseLayoutEffect will show warning if used during ssr, for example with Next.js
// UseIsomorphicEffect removes it by replacing useLayoutEffect with useEffect during ssr
const useIsomorphicEffect =
  typeof document !== "undefined" ? useLayoutEffect : useEffect;
