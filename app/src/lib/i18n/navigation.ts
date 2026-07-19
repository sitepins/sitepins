/**
 * Locale-aware navigation helpers.
 * Import Link, useRouter, usePathname, redirect from HERE instead of
 * next/link or next/navigation wherever locale-awareness is needed.
 */
import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
