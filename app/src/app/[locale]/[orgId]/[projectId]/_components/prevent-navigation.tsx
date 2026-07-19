"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type PreventNavigationProps = {
  isDirty: boolean;
  resetData: () => void;
};

const PreventNavigation = ({ isDirty, resetData }: PreventNavigationProps) => {
  const tCommonPreventNavigation = useTranslations("common.prevent_navigation");
  const [leavingPage, setLeavingPage] = useState(false);
  const router = useRouter();
  const isNavigatingRef = useRef(false);
  const hasPushedStateRef = useRef(false);

  // Function that will be called when the user confirms leaving
  const confirmationFn = useRef<() => void>(() => {});

  // Push history state when becoming dirty (to intercept back button)
  useEffect(() => {
    if (typeof window === "undefined") return;

    if (isDirty && !hasPushedStateRef.current) {
      window.history.pushState(null, document.title, window.location.href);
      hasPushedStateRef.current = true;
    } else if (!isDirty) {
      if (hasPushedStateRef.current && !isNavigatingRef.current) {
        window.history.back();
      }
      hasPushedStateRef.current = false;
    }
  }, [isDirty]);

  useEffect(() => {
    // Handle clicks on internal links
    const handleClick = (event: MouseEvent) => {
      if (!isDirty || isNavigatingRef.current) return;

      const target = event.target as HTMLElement;
      const link = target.closest("a");

      if (link?.href) {
        try {
          const url = new URL(link.href);
          const currentUrl = new URL(window.location.href);

          if (
            url.origin === currentUrl.origin &&
            url.pathname !== currentUrl.pathname
          ) {
            event.preventDefault();
            event.stopPropagation();

            confirmationFn.current = () => {
              isNavigatingRef.current = true;
              router.push(link.href);
            };

            setLeavingPage(true);
          }
        } catch {
          // Invalid URL, let it proceed normally
        }
      }
    };

    // Handle browser back/forward buttons
    const handlePopState = () => {
      if (!isDirty || isNavigatingRef.current) return;

      // Push state again to prevent navigation
      window.history.pushState(null, document.title, window.location.href);

      confirmationFn.current = () => {
        isNavigatingRef.current = true;
        const delta = hasPushedStateRef.current ? -2 : -1;
        window.history.go(delta);
      };

      setLeavingPage(true);
    };

    // Handle page reload or external navigation
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty && !isNavigatingRef.current) {
        e.preventDefault();
        return (e.returnValue = tCommonPreventNavigation("browser_prompt"));
      }
    };

    document.addEventListener("click", handleClick, true);
    window.addEventListener("popstate", handlePopState);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      document.removeEventListener("click", handleClick, true);
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isDirty, router, tCommonPreventNavigation]);

  const handleNoCallback = () => {
    setLeavingPage(false);
    confirmationFn.current = () => {};
  };

  // Track mount state to prevent fallback if unmounted (success)
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const handleYesCallback = () => {
    setLeavingPage(false);
    confirmationFn.current();
    confirmationFn.current = () => {};
    resetData();

    // Fallback: if navigation fails/stalls, try one more back since we are clean now
    setTimeout(() => {
      // Check if we are still mounted. If unmounted, navigation succeeded.
      if (!isMountedRef.current) return;

      if (typeof window !== "undefined") {
        if (isNavigatingRef.current) {
          router.back();
        }
      }
      isNavigatingRef.current = false;
    }, 600);
  };

  return (
    <AlertDialog open={leavingPage}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center">
            <TriangleAlert className="text-destructive mr-2" />
            {tCommonPreventNavigation("title")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {tCommonPreventNavigation("description")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleNoCallback}>
            {tCommonPreventNavigation("stay")}
          </AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={handleYesCallback}>
            {tCommonPreventNavigation("leave")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default PreventNavigation;
