"use client";

import { selectConfig } from "@/redux/features/config/slice";
import { useAppSelector } from "@/redux/store";
import { RefObject, useCallback, useEffect, useRef } from "react";

interface UncommittedFile {
  path: string;
  content: string;
}

// Shared registry of open preview windows keyed by `repo#branch`. The
// EditorWrapper-scoped `previewWindowRef` is reset whenever the user
// navigates between files (component remount), so it can't be the source of
// truth for "is the preview tab still open". This module-level map persists
// across remounts and lets the typing-sync flow act correctly.
const previewWindows = new Map<string, Window>();

export function setPreviewWindow(cacheKey: string, win: Window) {
  previewWindows.set(cacheKey, win);
}

export function getPreviewWindow(cacheKey: string): Window | null {
  const win = previewWindows.get(cacheKey);
  if (!win) return null;
  if (win.closed) {
    previewWindows.delete(cacheKey);
    return null;
  }
  return win;
}

// Frameworks whose preview tab refreshes itself automatically when a content
// file is rewritten (dev-server HMR / livereload over WebSocket):
//   - astro: Vite content-module HMR
//   - hugo / hugo_examplesite: livereload WebSocket (after --liveReloadPort 443)
// Next.js is NOT in this set — its HMR WebSocket doesn't reliably reach the
// preview tab through Vercel's proxy. Instead we postMessage a reload signal
// to the bridge component we inject into the sandbox layout, which calls
// location.reload() in place (preserving the user's current URL).
const HMR_REFRESHES_CONTENT = new Set([
  "astro",
  "hugo",
  "hugo_examplesite",
  "jekyll",
  "hexo",
]);

interface UseSandboxPreviewProps {
  contentVersion: unknown;
  getUncommittedFile: () => UncommittedFile;
  previewWindowRef?: RefObject<Window | null>;
  vercelToken?: string;
  vercelTeamId?: string;
  vercelProjectId?: string;
  spProjectId?: string;
  debounceMs?: number;
}

export function useSandboxPreview({
  contentVersion,
  getUncommittedFile,
  previewWindowRef,
  vercelToken,
  vercelTeamId,
  vercelProjectId,
  spProjectId,
  debounceMs = 2500,
}: UseSandboxPreviewProps) {
  const config = useAppSelector(selectConfig);

  // Stable ref so the debounce timer always calls the latest version
  // without resetting the timer on each render.
  const getUncommittedFileRef = useRef(getUncommittedFile);
  useEffect(() => {
    getUncommittedFileRef.current = getUncommittedFile;
  }, [getUncommittedFile]);

  const reopenIfClosed = useCallback(
    (url: string, repo: string, branch: string) => {
      const cacheKey = `${repo}#${branch}`;
      // Source of truth is the module-level map (survives remounts). The
      // per-instance ref is only a fallback for the very first open before
      // PreviewButton has registered the window.
      const existing =
        getPreviewWindow(cacheKey) ??
        (previewWindowRef?.current && !previewWindowRef.current.closed
          ? previewWindowRef.current
          : null);
      if (existing) return;
      const cleanRepo = repo.replace(/[^a-zA-Z0-9]/g, "-");
      const cleanBranch = branch.replace(/[^a-zA-Z0-9]/g, "-");
      const tabName = `sitepins-preview-${cleanRepo}-${cleanBranch}`;
      const baseUrl = url.endsWith("/") ? url.slice(0, -1) : url;
      const win = window.open(baseUrl + "?_t=" + Date.now(), tabName);
      if (win) {
        if (previewWindowRef) previewWindowRef.current = win;
        setPreviewWindow(cacheKey, win);
      }
    },
    [previewWindowRef],
  );

  const triggerCommitSync = useCallback(() => {
    if (!config.repoName || !config.branch || !config.token) return;
    const repo = config.repoName.includes("/")
      ? config.repoName
      : `${config.owner}/${config.repoName}`;
    const cacheKey = `${repo}#${config.branch}`;

    fetch("/api/sandbox/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        repository: repo,
        branch: config.branch,
        token: config.token,
        provider: config.provider,
        generator: config.framework,
        forceSync: true,
        onlyIfActive: true,
        vercelToken,
        vercelTeamId,
        vercelProjectId,
        spProjectId,
      }),
    })
      .then(async (res) => {
        if (!res.ok) return;
        const data = await res.json();
        if (!data.sandboxName && !data.previewUrl) return;
        const url =
          data.previewUrl ||
          localStorage.getItem(`sitepins_preview_${cacheKey}`);
        if (url) reopenIfClosed(url, repo, config.branch);
      })
      .catch((err) => {
        console.error("[sandbox] commit-path sync failed:", err);
      });
  }, [
    config,
    vercelToken,
    vercelTeamId,
    vercelProjectId,
    spProjectId,
    reopenIfClosed,
  ]);

  // Debounced typing sync — skips if no active preview session.
  useEffect(() => {
    if (!config.repoName || !config.branch || !config.token) return;

    const repo = config.repoName.includes("/")
      ? config.repoName
      : `${config.owner}/${config.repoName}`;
    const cacheKey = `${repo}#${config.branch}`;

    const hasActivePreview =
      typeof window !== "undefined" &&
      !!localStorage.getItem(`sitepins_preview_${cacheKey}`);
    if (!hasActivePreview) return;

    const timer = setTimeout(() => {
      const uncommittedFile = getUncommittedFileRef.current();

      fetch("/api/sandbox/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repository: repo,
          branch: config.branch,
          token: config.token,
          provider: config.provider,
          generator: config.framework,
          onlyIfActive: true,
          uncommittedFile,
          vercelToken,
          vercelTeamId,
          vercelProjectId,
          spProjectId,
        }),
      })
        .then(async (res) => {
          if (!res.ok) return;
          const data = await res.json();
          if (!data.uncommittedSynced) return;

          const url =
            data.previewUrl ||
            localStorage.getItem(`sitepins_preview_${cacheKey}`);
          if (!url) return;
          const baseUrl = url.endsWith("/") ? url.slice(0, -1) : url;
          const fw = (config.framework ?? "").toLowerCase();

          // Resolve the current preview window via the shared registry so
          // navigating between editor files doesn't lose the handle.
          const resolveWin = () =>
            getPreviewWindow(cacheKey) ??
            (previewWindowRef?.current && !previewWindowRef.current.closed
              ? previewWindowRef.current
              : null);

          if (data.serverRestarted) {
            // Hugo one-time --liveReloadPort 443 migration restart. Hugo's
            // livereload client doesn't auto-reload on WS reconnect, so we
            // navigate the existing tab once Hugo is back up (~5s cooldown).
            const isStaticGen = [
              "hugo",
              "hugo_examplesite",
              "jekyll",
              "hexo",
            ].includes(fw);
            if (isStaticGen) {
              setTimeout(() => {
                const w = resolveWin();
                if (w) w.location.href = baseUrl + "?_t=" + Date.now();
              }, 5000);
            }
            return;
          }

          // Don't reopen the tab when the user has closed it — typing should
          // never spawn a preview window. Re-opening is owned by PreviewButton.
          const win = resolveWin();
          if (!win) return;

          // Bridge was just injected for the first time — the preview tab still
          // has the old layout without the bridge component. Do a full navigation
          // to load the bridge, then subsequent updates use postMessage.
          if (data.bridgeJustInjected) {
            win.location.href = baseUrl + "?_t=" + Date.now();
            return;
          }

          // Frameworks in HMR_REFRESHES_CONTENT auto-update via WebSocket.
          // For Next.js: postMessage a reload signal to the bridge component
          // injected into the sandbox layout. The bridge calls location.reload()
          // which reloads the preview tab at its current URL (no navigation to root).
          if (!HMR_REFRESHES_CONTENT.has(fw)) {
            win.postMessage({ type: "sp-reload" }, "*");
          }
        })
        .catch(() => {});
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [
    contentVersion,
    config,
    vercelToken,
    vercelTeamId,
    vercelProjectId,
    spProjectId,
    reopenIfClosed,
    debounceMs,
    previewWindowRef,
  ]);

  return { triggerCommitSync };
}
