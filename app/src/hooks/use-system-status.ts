"use client";

import { useEffect, useState } from "react";
import { STATUS_API_URL, STATUS_URL } from "@/lib/brand";

export type SystemHealthStatus =
  "operational" | "degraded" | "outage" | "loading";

interface SystemStatusState {
  status: SystemHealthStatus;
  message: string;
  statusUrl: string;
  lastChecked: string | null;
}

// In-memory cache across component mounts
let cachedStatus: SystemStatusState | null = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

export function useSystemStatus() {
  const [state, setState] = useState<SystemStatusState>(() => {
    if (cachedStatus && Date.now() - lastFetchTime < CACHE_TTL_MS) {
      return cachedStatus;
    }
    return {
      status: "loading",
      message: "Checking system status...",
      statusUrl: STATUS_URL,
      lastChecked: null,
    };
  });

  useEffect(() => {
    let isMounted = true;

    async function fetchStatus() {
      // Use cache if fresh
      if (cachedStatus && Date.now() - lastFetchTime < CACHE_TTL_MS) {
        if (isMounted) setState(cachedStatus);
        return;
      }

      try {
        // Try fetching from status API (status.sitepins.com)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);

        const res = await fetch(STATUS_API_URL, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        }).catch(() => null);

        clearTimeout(timeoutId);

        if (res && res.ok) {
          const data = await res.json();
          const newState: SystemStatusState = {
            status: data.systemStatus || "operational",
            message: data.systemMessage || "All systems normal",
            statusUrl: STATUS_URL,
            lastChecked: data.lastChecked || new Date().toISOString(),
          };
          cachedStatus = newState;
          lastFetchTime = Date.now();
          if (isMounted) setState(newState);
          return;
        }

        // Fallback: Direct check of GitHub status if status site is unavailable
        const ghRes = await fetch(
          "https://www.githubstatus.com/api/v2/status.json",
          {
            signal: AbortSignal.timeout(3000),
          },
        ).catch(() => null);

        let fallbackStatus: SystemHealthStatus = "operational";
        let fallbackMessage = "All systems normal";

        if (ghRes && ghRes.ok) {
          const ghData = await ghRes.json();
          const indicator = ghData.status?.indicator;
          if (indicator === "minor") {
            fallbackStatus = "degraded";
            fallbackMessage = "Partial system degradation";
          } else if (indicator === "major" || indicator === "critical") {
            fallbackStatus = "outage";
            fallbackMessage = "Service outage detected";
          }
        }

        const fallbackState: SystemStatusState = {
          status: fallbackStatus,
          message: fallbackMessage,
          statusUrl: STATUS_URL,
          lastChecked: new Date().toISOString(),
        };

        cachedStatus = fallbackState;
        lastFetchTime = Date.now();
        if (isMounted) setState(fallbackState);
      } catch {
        const defaultState: SystemStatusState = {
          status: "operational",
          message: "All systems normal",
          statusUrl: STATUS_URL,
          lastChecked: new Date().toISOString(),
        };
        if (isMounted) setState(defaultState);
      }
    }

    fetchStatus();

    // Poll every 60 seconds
    const interval = setInterval(fetchStatus, 60000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  return state;
}
