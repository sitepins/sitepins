"use client";

import { Button } from "@/components/ui/button";
import {
  ButtonGroup,
  ButtonGroupSeparator,
} from "@/components/ui/button-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useOwnerPlan } from "@/hooks/use-owner-plan";
import { setPreviewWindow } from "@/hooks/use-sandbox-preview";
import { UpgradeDialog } from "@/layouts/components/upgrade-dialog";
import { isGitLabProvider } from "@/lib/utils/provider-checker";
import {
  ChevronDown,
  ExternalLink,
  Loader2,
  MonitorCheck,
  MonitorDot,
  MonitorOff,
  MonitorPlay,
  RefreshCw,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { RefObject, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

interface PreviewButtonProps {
  repository: string;
  branch: string;
  token: string;
  provider: "Github" | "Gitlab" | string;
  generator?: string | null;
  getUncommittedFile?: () => { path: string; content: string };
  previewWindowRef?: RefObject<Window | null>;
  vercelToken?: string;
  vercelTeamId?: string;
  vercelProjectId?: string;
  spProjectId?: string;
}

type SandboxStatus = "running" | "starting" | "stopped";

export default function PreviewButton({
  repository,
  branch,
  token,
  provider,
  generator,
  getUncommittedFile,
  previewWindowRef,
  vercelToken,
  vercelTeamId,
  vercelProjectId,
  spProjectId,
}: PreviewButtonProps) {
  const cacheKey = `${repository}#${branch}`;
  const lsPreviewKey = `sitepins_preview_${cacheKey}`;
  const lsSandboxKey = `sitepins_sandbox_${cacheKey}`;
  const lsShaKey = `sitepins_sha_${cacheKey}`;
  const lsStartedAtKey = `sitepins_sandbox_started_${cacheKey}`;

  const HOBBY_MAX_MS = 45 * 60 * 1000;

  const [isLoading, setIsLoading] = useState(false);
  const [isDestroying, setIsDestroying] = useState(false);
  const [loadingStep, setLoadingStep] = useState<string | null>(null);

  const [previewUrl, setPreviewUrl] = useState<string | null>(() =>
    typeof window !== "undefined" ? localStorage.getItem(lsPreviewKey) : null,
  );
  const [sandboxName, setSandboxName] = useState<string | null>(() =>
    typeof window !== "undefined" ? localStorage.getItem(lsSandboxKey) : null,
  );
  const [sandboxStatus, setSandboxStatus] = useState<SandboxStatus>(() =>
    typeof window !== "undefined" && localStorage.getItem(lsPreviewKey)
      ? "running"
      : "stopped",
  );
  const [isStale, setIsStale] = useState(false);

  const router = useRouter();
  const { orgId } = useParams<{ orgId: string }>();
  const { canAccessProFeatures } = useOwnerPlan();

  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);

  const hasWarnedExpiryRef = useRef(false);
  const hasProbedRef = useRef(false);

  // ── Cache helpers ──────────────────────────────────────────────────────

  const persistSession = useCallback(
    (url: string, sbId: string, sha: string) => {
      if (!url || !sbId) {
        console.warn("[preview] persistSession called with empty url/sbId", {
          url,
          sbId,
        });
        return;
      }
      localStorage.setItem(lsPreviewKey, url);
      localStorage.setItem(lsSandboxKey, sbId);
      localStorage.setItem(lsShaKey, sha);
      localStorage.setItem(lsStartedAtKey, String(Date.now()));
      setPreviewUrl(url);
      setSandboxName(sbId);
      setSandboxStatus("running");
      setIsStale(false);
      hasWarnedExpiryRef.current = false;
    },
    [lsPreviewKey, lsSandboxKey, lsShaKey, lsStartedAtKey],
  );

  const clearSession = useCallback(() => {
    localStorage.removeItem(lsPreviewKey);
    localStorage.removeItem(lsSandboxKey);
    localStorage.removeItem(lsShaKey);
    localStorage.removeItem(lsStartedAtKey);
    setPreviewUrl(null);
    setSandboxName(null);
    setSandboxStatus("stopped");
    setIsStale(false);
    hasWarnedExpiryRef.current = false;
  }, [lsPreviewKey, lsSandboxKey, lsShaKey, lsStartedAtKey]);

  // ── Mount liveness probe ──────────────────────────────────────────────
  // Verify the cached sandbox is actually alive before showing the green dot.
  // Without this, stale localStorage makes the dot green forever after page load.

  useEffect(() => {
    if (
      hasProbedRef.current ||
      !sandboxName ||
      !vercelToken ||
      !vercelProjectId
    )
      return;
    hasProbedRef.current = true;

    // Skip the probe for freshly-started sessions. Vercel's session state can
    // lag ~a few seconds behind the actual sandbox running state, and probing
    // immediately after a successful start can falsely report "stopped" and
    // wipe the session that was just persisted.
    const startedAt = Number(localStorage.getItem(lsStartedAtKey) ?? 0);
    if (startedAt && Date.now() - startedAt < 30_000) return;

    fetch("/api/sandbox/heartbeat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sandboxName,
        vercelToken,
        vercelTeamId,
        vercelProjectId,
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (!data.ok || data.status === "stopped") clearSession();
      })
      .catch(() => {
        // non-fatal — leave optimistic state; periodic heartbeat will correct it
      });
  }, [
    sandboxName,
    vercelToken,
    vercelTeamId,
    vercelProjectId,
    clearSession,
    lsStartedAtKey,
  ]);

  // ── Open preview ──────────────────────────────────────────────────────

  const handleOpen = useCallback(
    (urlToOpen?: string) => {
      const targetUrl = urlToOpen || previewUrl;
      if (!targetUrl) return;
      const cleanRepo = repository.replace(/[^a-zA-Z0-9]/g, "-");
      const cleanBranch = branch.replace(/[^a-zA-Z0-9]/g, "-");
      const tabName = `sitepins-preview-${cleanRepo}-${cleanBranch}`;
      const win = window.open(targetUrl, tabName);
      if (win) {
        if (previewWindowRef) previewWindowRef.current = win;
        // Register in the module-level map so the typing-sync flow can find
        // this window across editor-file navigations (each navigation creates
        // a fresh EditorWrapper + fresh per-instance ref).
        setPreviewWindow(cacheKey, win);
      }
    },
    [previewUrl, repository, branch, previewWindowRef, cacheKey],
  );

  // ── Stale check ───────────────────────────────────────────────────────

  const checkStale = useCallback(async () => {
    const cachedSha = localStorage.getItem(lsShaKey);
    if (!cachedSha || !repository || !branch || !token) return;

    try {
      let latestSha = "";
      if (isGitLabProvider(provider)) {
        const projectId = encodeURIComponent(repository);
        const res = await fetch(
          `https://gitlab.com/api/v4/projects/${projectId}/repository/commits?ref_name=${encodeURIComponent(branch)}&per_page=1`,
          { headers: { "PRIVATE-TOKEN": token } },
        );
        if (res.ok) {
          const data = await res.json();
          latestSha = data?.[0]?.id ?? "";
        }
      } else {
        const [owner, repo] = repository.split("/");
        const res = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/commits/${encodeURIComponent(branch)}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "X-GitHub-Api-Version": "2022-11-28",
            },
          },
        );
        if (res.ok) {
          const data = await res.json();
          latestSha = data?.sha ?? "";
        }
      }
      if (latestSha && latestSha !== cachedSha) setIsStale(true);
    } catch {
      // non-fatal
    }
  }, [repository, branch, token, provider, lsShaKey]);

  useEffect(() => {
    if (!previewUrl) return;
    checkStale();
    window.addEventListener("focus", checkStale);
    return () => window.removeEventListener("focus", checkStale);
  }, [previewUrl, checkStale]);

  // ── Heartbeat + 45-min expiry ─────────────────────────────────────────

  useEffect(() => {
    if (!sandboxName || sandboxStatus !== "running" || !vercelToken) return;

    const HEARTBEAT_INTERVAL = 4 * 60 * 1000;
    const EXPIRY_WARN_BEFORE = 5 * 60 * 1000;

    const tick = async () => {
      const startedAt = Number(localStorage.getItem(lsStartedAtKey) ?? 0);
      if (startedAt) {
        const elapsed = Date.now() - startedAt;
        if (elapsed >= HOBBY_MAX_MS) {
          clearSession();
          toast.info("Preview session expired", {
            description:
              "45-minute Hobby plan limit reached. Snapshot saved — restart is fast (~20s).",
            duration: 12000,
          });
          return;
        }
        if (
          !hasWarnedExpiryRef.current &&
          elapsed >= HOBBY_MAX_MS - EXPIRY_WARN_BEFORE
        ) {
          hasWarnedExpiryRef.current = true;
          const minsLeft = Math.ceil((HOBBY_MAX_MS - elapsed) / 60000);
          toast.warning(`Preview expires in ~${minsLeft} min`, {
            id: "sandbox-expiry-warning",
            description:
              "Snapshot saved — clicking Preview again starts fresh in ~20s.",
            duration: 30000,
          });
        }
      }

      // Skip heartbeat if preview window is closed (let inactivity timeout kill it)
      const windowClosed =
        previewWindowRef?.current !== undefined &&
        previewWindowRef.current !== null &&
        previewWindowRef.current.closed;
      if (windowClosed) return;

      try {
        const res = await fetch("/api/sandbox/heartbeat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sandboxName,
            vercelToken,
            vercelTeamId,
            vercelProjectId,
          }),
        });
        const data = await res.json();
        if (!data.ok || data.status === "stopped") clearSession();
      } catch {
        // non-fatal
      }
    };

    const id = setInterval(tick, HEARTBEAT_INTERVAL);
    return () => clearInterval(id);
  }, [
    sandboxName,
    sandboxStatus,
    vercelToken,
    vercelTeamId,
    vercelProjectId,
    clearSession,
    lsStartedAtKey,
    previewWindowRef,
    HOBBY_MAX_MS,
  ]);

  // ── Stop sandbox on page unload ───────────────────────────────────────

  useEffect(() => {
    if (!sandboxName || !vercelToken || !vercelProjectId) return;

    const stopBeacon = () => {
      const payload = JSON.stringify({
        sandboxName,
        vercelToken,
        vercelTeamId,
        vercelProjectId,
        spProjectId,
      });
      navigator.sendBeacon(
        "/api/sandbox/stop",
        new Blob([payload], { type: "application/json" }),
      );
    };

    window.addEventListener("pagehide", stopBeacon);
    return () => window.removeEventListener("pagehide", stopBeacon);
  }, [sandboxName, vercelToken, vercelTeamId, vercelProjectId, spProjectId]);

  // ── Start / sync sandbox (SSE) ────────────────────────────────────────

  const startSandbox = async (isSync = false) => {
    if (!canAccessProFeatures) {
      setShowUpgradeDialog(true);
      return;
    }

    setIsLoading(true);
    setLoadingStep(null);
    setSandboxStatus("starting");

    const uncommittedFile = getUncommittedFile?.();

    try {
      const res = await fetch("/api/sandbox/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repository,
          branch,
          token,
          provider,
          generator,
          forceSync: isSync,
          uncommittedFile,
          vercelToken,
          vercelTeamId,
          vercelProjectId,
          spProjectId,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        if (errData.code === "VERCEL_CREDENTIALS_MISSING") {
          router.push(`/${orgId}/settings/sandbox`);
          return;
        }
        throw new Error(errData.error ?? `HTTP ${res.status}`);
      }

      const contentType = res.headers.get("Content-Type") ?? "";

      if (contentType.includes("text/event-stream")) {
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        outer: while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            try {
              const payload = JSON.parse(line.slice(5).trim());
              if (payload.error) throw new Error(payload.error);
              if (payload.step) setLoadingStep(payload.step);
              if (payload.done) {
                persistSession(
                  payload.previewUrl,
                  payload.sandboxName ?? "",
                  payload.commitSha ?? "",
                );
                toast.success("Preview ready!", {
                  description: "Click 'Open Preview' to view.",
                  duration: 8000,
                  action: {
                    label: "Open",
                    onClick: () => handleOpen(payload.previewUrl),
                  },
                });
                handleOpen(payload.previewUrl);
                break outer;
              }
            } catch (parseErr: any) {
              if (parseErr?.message) throw parseErr;
            }
          }
        }
      } else {
        const data = await res.json();
        if (data.previewUrl) {
          persistSession(
            data.previewUrl,
            data.sandboxName ?? "",
            data.commitSha ?? "",
          );
          handleOpen(data.previewUrl);
        }
      }
    } catch (err: any) {
      setSandboxStatus(previewUrl ? "running" : "stopped");
      toast.error("Preview failed", {
        description: err?.message ?? "An unexpected error occurred.",
        duration: 6000,
      });
    } finally {
      setIsLoading(false);
      setLoadingStep(null);
    }
  };

  // ── Destroy preview ───────────────────────────────────────────────────

  const destroyPreview = async () => {
    setIsDestroying(true);
    try {
      if (sandboxName && vercelToken && vercelProjectId) {
        await fetch("/api/sandbox/stop", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sandboxName,
            vercelToken,
            vercelTeamId,
            vercelProjectId,
            spProjectId,
          }),
        });
      }
    } catch {
      // ignore — clear session regardless
    } finally {
      clearSession();
      setIsDestroying(false);
      toast.success("Preview destroyed", {
        description: "Sandbox stopped. CPU usage freed.",
      });
    }
  };

  // ── Status dot ────────────────────────────────────────────────────────

  // Icon for each sandbox state — replaces the color dot so small screens
  // show a recognisable symbol rather than an ambiguous coloured circle.
  const statusIcon =
    sandboxStatus === "starting" ? (
      <Loader2 className="text-warning size-3.5 animate-spin" />
    ) : sandboxStatus === "running" && isStale ? (
      // Running but code is ahead of what the sandbox has built
      <MonitorDot className="text-warning size-3.5" />
    ) : sandboxStatus === "running" ? (
      <MonitorCheck className="text-success size-3.5" />
    ) : (
      <MonitorOff className="text-muted-foreground/60 size-3.5" />
    );

  // ── Render ────────────────────────────────────────────────────────────

  const upgradeDialog = (
    <UpgradeDialog
      open={showUpgradeDialog}
      onOpenChange={setShowUpgradeDialog}
      contextKey="preview"
    />
  );

  // No preview yet — single plain button
  if (!previewUrl) {
    return (
      <>
        <Button
          id="project-preview-button"
          variant="outline"
          onClick={() => startSandbox(false)}
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <MonitorPlay className="size-3.5" />
          )}
          <span className="hidden sm:inline">
            {isLoading ? (loadingStep ?? "Starting") : "Preview"}
          </span>
        </Button>
        {upgradeDialog}
      </>
    );
  }

  // Preview exists — ButtonGroup with dropdown
  return (
    <>
      <ButtonGroup>
        {/* Main action: verify sandbox alive then open (auto-restarts if stopped) */}
        <Button
          id="project-preview-open-button"
          variant="outline"
          onClick={() => startSandbox(false)}
          disabled={isLoading || isDestroying}
          title={isStale ? "Preview may be outdated — use Sync" : undefined}
        >
          {isLoading ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            statusIcon
          )}
          <span className="hidden sm:inline">
            {isLoading ? (loadingStep ?? "Starting") : "Preview"}
          </span>
        </Button>

        <ButtonGroupSeparator orientation="vertical" />

        {/* Dropdown: Sync / Open / Destroy */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              aria-label="Preview options"
              disabled={isLoading || isDestroying}
            >
              {isDestroying ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <ChevronDown className="size-3.5" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="[--radius:1rem]">
            <DropdownMenuItem
              className="cursor-pointer"
              onSelect={() => startSandbox(true)}
            >
              <RefreshCw className="size-3.5" />
              Sync Preview
            </DropdownMenuItem>
            <DropdownMenuItem
              className="cursor-pointer"
              onSelect={() => handleOpen()}
            >
              <ExternalLink className="size-3.5" />
              Open Preview
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive cursor-pointer"
              onSelect={destroyPreview}
            >
              <MonitorOff className="size-3.5" />
              Destroy Preview
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </ButtonGroup>
      {upgradeDialog}
    </>
  );
}
