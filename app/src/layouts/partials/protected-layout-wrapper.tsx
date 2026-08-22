"use client";

import Loading from "@/components/loading";
import { useHydrated } from "@/hooks/use-hydrated";
import { authClient, Session } from "@/lib/auth/auth-client";
import { usePlanBootstrap } from "@/redux/features/plan/slice";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useSyncExternalStore } from "react";

const CACHED_SESSION_KEY = "sitepins_cached_session";

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

function getCachedSessionSnapshot(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(CACHED_SESSION_KEY);
  } catch {
    return null;
  }
}

function subscribeCachedSession(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener("storage", callback);
  };
}

export default function ProtectedLayoutWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: auth, isPending } = authClient.useSession();
  const router = useRouter();
  const hasHydrated = useHydrated();
  const isOnline = useSyncExternalStore(
    subscribeOnline,
    getIsOnline,
    () => true,
  );

  const cachedSessionRaw = useSyncExternalStore(
    subscribeCachedSession,
    getCachedSessionSnapshot,
    () => null,
  );

  const cachedAuth = useMemo<Session | null>(() => {
    if (!cachedSessionRaw) return null;
    try {
      return JSON.parse(cachedSessionRaw) as Session;
    } catch {
      return null;
    }
  }, [cachedSessionRaw]);

  // Sync valid online session to localStorage for offline resilience
  useEffect(() => {
    if (auth) {
      try {
        localStorage.setItem(CACHED_SESSION_KEY, JSON.stringify(auth));
      } catch {
        // Silently catch storage errors
      }
    }
  }, [auth]);

  const activeAuth = auth || cachedAuth;
  const isAuthenticated = !!activeAuth;

  // Redirect unauthenticated users to login ONLY if they are online and truly unauthenticated
  // When offline, do NOT redirect to login due to network errors
  useEffect(() => {
    if (!isPending && !auth && isOnline && !cachedAuth) {
      const from = `${window.location.pathname}${window.location.search}`;
      router.replace(`/login?from=${encodeURIComponent(from)}`);
    }
  }, [auth, isPending, isOnline, cachedAuth, router]);

  usePlanBootstrap({
    userId: activeAuth?.user.user_id,
    enabled: isAuthenticated,
  });

  if (!hasHydrated || (isPending && !cachedAuth) || (!activeAuth && isOnline)) {
    return <Loading fullScreen />;
  }

  return <>{children}</>;
}
