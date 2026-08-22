"use client";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { WifiOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useSyncExternalStore } from "react";

function getIsOnline() {
  if (typeof window === "undefined") return true;
  return navigator.onLine;
}

function subscribeOnline(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

export function PwaRegister() {
  const tCommon = useTranslations("common");

  const isOnline = useSyncExternalStore(
    subscribeOnline,
    getIsOnline,
    () => true,
  );

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    const handleOnline = () => {
      toast.success(tCommon("pwa.online_restored"));
    };

    const handleOffline = () => {
      toast.warning(tCommon("pwa.offline_toast"));
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    if (process.env.NODE_ENV !== "production") {
      // In development mode, unregister any active service workers so Turbopack/HMR chunks are never cached
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) {
          registration.unregister();
        }
      });
      return () => {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
      };
    }

    let isRefreshing = false;

    // Reload page when new service worker takes control
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!isRefreshing) {
        isRefreshing = true;
        window.location.reload();
      }
    });

    const registerSW = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });

        // If there's already a waiting worker, prompt update
        if (registration.waiting) {
          showUpdateNotification(registration.waiting);
        }

        // Detect if a new worker is found
        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener("statechange", () => {
            if (
              newWorker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              showUpdateNotification(newWorker);
            }
          });
        });
      } catch {
        // Silently catch registration errors in environments where SW is unavailable
      }
    };

    const showUpdateNotification = (worker: ServiceWorker) => {
      toast.info(tCommon("pwa.update_available"), {
        duration: 12000,
        action: {
          label: tCommon("pwa.reload"),
          onClick: () => {
            worker.postMessage({ type: "SKIP_WAITING" });
          },
        },
      });
    };

    // Register service worker after window load for optimal performance
    if (document.readyState === "complete") {
      registerSW();
    } else {
      window.addEventListener("load", registerSW);
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("load", registerSW);
    };
  }, [tCommon]);

  if (isOnline) {
    return null;
  }

  return (
    <aside
      aria-label="Offline status"
      className="bg-destructive/95 text-destructive-foreground animate-in slide-in-from-top-2 fixed top-0 right-0 left-0 z-1000 flex items-center justify-between gap-3 px-4 py-2 text-xs font-medium shadow-lg backdrop-blur-md transition-all sm:text-sm"
    >
      <div className="flex items-center gap-2">
        <WifiOff className="size-4 shrink-0 animate-pulse" />
        <span>{tCommon("pwa.offline_warning")}</span>
      </div>
      <Button
        variant="default"
        size="sm"
        onClick={() => window.location.reload()}
      >
        {tCommon("pwa.retry")}
      </Button>
    </aside>
  );
}
