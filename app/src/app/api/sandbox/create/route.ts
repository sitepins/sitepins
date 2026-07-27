import { getAuth } from "@/lib/auth/auth-server";
import { ensureReloadBridge } from "@/lib/sandbox/bridges";
import {
  installGoIfNeeded,
  installHugoIfNeeded,
  patchPackageScripts,
  restartDevServer,
  startDevServer,
} from "@/lib/sandbox/dev-server";
import { frameworkPort, frameworkSpec } from "@/lib/sandbox/frameworks";
import {
  getLatestCommitSha,
  gitCloneSource,
  pullLatestCommits,
} from "@/lib/sandbox/git";
import {
  getCachedPreview,
  syncSandboxPreviewState,
} from "@/lib/sandbox/preview-state";
import {
  COLD_START_TIMEOUT_MS,
  detectPackageManager,
  installDeps,
  isDevServerAlive,
  PKG_INSTALL,
  SERVER_READY_TIMEOUT_MS,
  waitForServer,
  writeFileViaShell,
} from "@/lib/sandbox/session";
import { cleanVercelFetch, getSandboxAuth } from "@/lib/vercel-sandbox-auth";
import { Sandbox } from "@vercel/sandbox";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 600;

// ── Quick ops handler ──

async function handleQuickOp(
  body: Record<string, any>,
  cookieHeader: string,
  signal: AbortSignal,
): Promise<NextResponse> {
  const {
    repository,
    branch,
    token,
    provider,
    generator,
    forceSync,
    uncommittedFile,
    spProjectId,
  } = body;
  if (!spProjectId) return NextResponse.json({ active: false });

  const auth = getSandboxAuth(body);
  const port = frameworkPort(generator);
  const { sandboxName, commitSha: cachedSha } = await getCachedPreview(
    spProjectId,
    cookieHeader,
  );
  if (!sandboxName) return NextResponse.json({ active: false });

  try {
    const sandbox = await Sandbox.get({
      name: sandboxName,
      resume: false,
      ...auth,
      signal,
      fetch: cleanVercelFetch,
    });
    const session = sandbox.currentSession();
    if (session.status !== "running") throw new Error("stopped");

    const previewUrl = session.domain(port);

    if (uncommittedFile) {
      try {
        await writeFileViaShell(
          session,
          uncommittedFile.path,
          uncommittedFile.content,
          signal,
        );
      } catch {
        // Write failed but sandbox is still alive — don't clear preview state.
        // Client retries on next keystroke.
        return NextResponse.json({
          sandboxName,
          previewUrl,
          uncommittedSynced: false,
        });
      }

      // Fast no-op after the first install.
      const bridgeJustInjected = await ensureReloadBridge(
        generator,
        session,
        signal,
      );

      // Framework migrations: if the dev flags in package.json changed, the
      // server has to be restarted to pick them up.
      if (frameworkSpec(generator)?.patchScripts) {
        const didPatch = await patchPackageScripts(session, signal);
        if (didPatch) {
          await restartDevServer(
            session,
            await detectPackageManager(session, signal),
            port,
            generator,
            previewUrl,
            signal,
          );
          return NextResponse.json({
            sandboxName,
            previewUrl,
            uncommittedSynced: true,
            serverRestarted: true,
          });
        }
      }

      return NextResponse.json({
        sandboxName,
        previewUrl,
        uncommittedSynced: true,
        ...(bridgeJustInjected && { bridgeJustInjected: true }),
      });
    }

    if (forceSync) {
      const latestSha = await getLatestCommitSha(
        provider,
        repository,
        branch,
        token,
        signal,
      );
      if (latestSha && cachedSha !== latestSha) {
        await pullLatestCommits(
          session,
          repository,
          branch,
          provider,
          token,
          signal,
        );
        const pm = await detectPackageManager(session, signal);
        await session.runCommand({
          cmd: PKG_INSTALL[pm][0],
          args: PKG_INSTALL[pm].slice(1),
          signal,
        });
        await restartDevServer(
          session,
          pm,
          port,
          generator,
          previewUrl,
          signal,
        );
        await waitForServer(previewUrl, 15_000, signal);
        await syncSandboxPreviewState(
          spProjectId,
          {
            sandbox_name: sandboxName,
            preview_url: previewUrl,
            commit_sha: latestSha,
          },
          cookieHeader,
        );
      }
    }

    return NextResponse.json({ sandboxName, previewUrl });
  } catch {
    return NextResponse.json({ active: false });
  }
}

// ── Streaming sandbox creation ────────────────────────────────────────────────

const enc = new TextEncoder();

async function* streamCreate(
  body: Record<string, any>,
  cookieHeader: string,
  signal: AbortSignal,
): AsyncGenerator<object> {
  const {
    repository,
    branch,
    token,
    provider,
    generator,
    uncommittedFile,
    spProjectId,
  } = body;
  if (!spProjectId) throw new Error("spProjectId is required");

  const auth = getSandboxAuth(body);
  const port = frameworkPort(generator);
  const spec = frameworkSpec(generator);

  yield { step: "Checking session" };
  const latestSha = await getLatestCommitSha(
    provider,
    repository,
    branch,
    token,
    signal,
  );
  const { sandboxName: cachedName, commitSha: cachedSha } =
    await getCachedPreview(spProjectId, cookieHeader);

  // ── 1. Try to reuse existing sandbox ──
  if (cachedName) {
    try {
      const existing = await Sandbox.get({
        name: cachedName,
        resume: false,
        ...auth,
        signal,
        fetch: cleanVercelFetch,
      });
      const running = existing.currentSession();
      const isRunning = running.status === "running";

      if (isRunning) {
        const previewUrl = running.domain(port);
        const isUpToDate = !latestSha || cachedSha === latestSha;

        if (isUpToDate && (await isDevServerAlive(previewUrl, signal))) {
          await syncSandboxPreviewState(
            spProjectId,
            {
              sandbox_name: cachedName,
              preview_url: previewUrl,
              commit_sha: latestSha ?? cachedSha,
            },
            cookieHeader,
          );
          await ensureReloadBridge(generator, running, signal);
          yield {
            done: true,
            previewUrl,
            sandboxName: cachedName,
            commitSha: latestSha,
          };
          return;
        }
      }

      // Either the code is stale / the dev server died, or the session was
      // stopped and has to be resumed. Both paths end in the same restart.
      let activeSession = running;
      let previewUrl = running.domain(port);

      if (!isRunning) {
        yield { step: "Resuming sandbox" };
        const resumed = await Sandbox.get({
          name: cachedName,
          resume: true,
          ...auth,
          signal,
          fetch: cleanVercelFetch,
        });
        activeSession = resumed.currentSession();
        previewUrl = activeSession.domain(port);
      }

      if (latestSha && cachedSha !== latestSha) {
        yield { step: "Pulling commits" };
        await pullLatestCommits(
          activeSession,
          repository,
          branch,
          provider,
          token,
          signal,
        );
        yield { step: "Installing dependencies" };
        await installDeps(
          activeSession,
          await detectPackageManager(activeSession, signal),
          signal,
        );
      }

      await ensureReloadBridge(generator, activeSession, signal);
      yield { step: "Starting server" };
      await restartDevServer(
        activeSession,
        await detectPackageManager(activeSession, signal),
        port,
        generator,
        previewUrl,
        signal,
      );
      const ready = await waitForServer(
        previewUrl,
        SERVER_READY_TIMEOUT_MS,
        signal,
      );
      if (!ready) throw new Error("Dev server did not become ready in time.");

      await syncSandboxPreviewState(
        spProjectId,
        {
          sandbox_name: cachedName,
          preview_url: previewUrl,
          commit_sha: latestSha ?? cachedSha,
        },
        cookieHeader,
      );
      yield {
        done: true,
        previewUrl,
        sandboxName: cachedName,
        commitSha: latestSha,
      };
      return;
    } catch {
      // Sandbox gone or unreachable — fall through to cold-start
    }
  }

  // ── 2. Cold start: clone → install → start ──
  yield { step: "Cloning repository" };
  const sandbox = await Sandbox.create({
    source: gitCloneSource(provider, repository, branch, token),
    ports: [port],
    timeout: COLD_START_TIMEOUT_MS,
    signal,
    fetch: cleanVercelFetch,
    ...auth,
  });
  const sandboxName = sandbox.name;
  const session = sandbox.currentSession();
  const previewUrl = session.domain(port);

  yield { step: "Installing dependencies" };
  const pm = await detectPackageManager(session, signal);
  await installDeps(session, pm, signal);

  if (spec?.needsHugoToolchain) {
    yield { step: "Installing Go" };
    await installGoIfNeeded(session, signal);
    yield { step: "Installing Hugo" };
    await installHugoIfNeeded(session, signal);
  }

  if (uncommittedFile) {
    await writeFileViaShell(
      session,
      uncommittedFile.path,
      uncommittedFile.content,
      signal,
    );
  }

  await ensureReloadBridge(generator, session, signal);

  yield { step: "Starting server" };
  await startDevServer(session, pm, port, generator, previewUrl, signal);

  yield { step: "Waiting for server" };
  const ready = await waitForServer(
    previewUrl,
    SERVER_READY_TIMEOUT_MS,
    signal,
  );

  if (!ready) {
    await session.stop();
    throw new Error(
      "Dev server did not become ready in time. Check your project for build errors.",
    );
  }

  await syncSandboxPreviewState(
    spProjectId,
    {
      sandbox_name: sandboxName,
      preview_url: previewUrl,
      commit_sha: latestSha ?? undefined,
    },
    cookieHeader,
  );

  yield { done: true, previewUrl, sandboxName, commitSha: latestSha };
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await getAuth(req);
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cookieHeader = req.headers.get("cookie") ?? "";
  const body = await req.json();

  if (!body.repository || !body.branch) {
    return NextResponse.json(
      { error: "repository and branch are required" },
      { status: 400 },
    );
  }
  if (!body.spProjectId) {
    return NextResponse.json(
      { error: "spProjectId is required" },
      { status: 400 },
    );
  }

  if (!body.vercelToken || !body.vercelProjectId) {
    return NextResponse.json(
      {
        error: "Vercel credentials not configured.",
        code: "VERCEL_CREDENTIALS_MISSING",
      },
      { status: 400 },
    );
  }

  // Quick background ops (typing sync) → JSON
  // Only short-circuit when onlyIfActive is explicitly set.
  // uncommittedFile alone must NOT gate here — it's also used in the SSE
  // cold-start path (streamCreate writes the file after cloning).
  if (body.onlyIfActive) {
    return handleQuickOp(body, cookieHeader, req.signal);
  }

  // New sandbox creation → SSE stream
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const msg of streamCreate(body, cookieHeader, req.signal)) {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(msg)}\n\n`));
        }
      } catch (e: any) {
        // Surface the real Vercel API error body — the SDK wraps the response
        // payload in `.json` / `.text` on its APIError. Without this, all
        // failures collapse to a generic "Status code 403 is not ok".
        const apiJson = e?.json;
        const detail =
          apiJson?.error?.message ||
          (typeof apiJson?.error === "string" ? apiJson.error : null) ||
          apiJson?.message ||
          e?.text ||
          e?.message ||
          "Unknown error";
        const code = apiJson?.error?.code || apiJson?.code;
        console.error("[sandbox/create] error:", {
          message: e?.message,
          code,
          json: apiJson,
          text: e?.text,
        });
        controller.enqueue(
          enc.encode(`data: ${JSON.stringify({ error: detail, code })}\n\n`),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
