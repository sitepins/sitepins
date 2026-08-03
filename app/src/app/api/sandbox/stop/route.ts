import { Sandbox } from "@vercel/sandbox";
import { getAuth } from "@/lib/auth/auth-server";
import { canAccessProject } from "@/lib/sandbox/preview-state";
import { cleanVercelFetch, getSandboxAuth } from "@/lib/vercel-sandbox-auth";
import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "";
const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET ?? "";

async function clearProjectPreviewState(
  projectId: string,
  cookieHeader: string,
) {
  if (!INTERNAL_SECRET || !BACKEND) return;
  try {
    await fetch(`${BACKEND}/project-preview/${encodeURIComponent(projectId)}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        cookie: cookieHeader,
        "x-internal-secret": INTERNAL_SECRET,
      },
      body: JSON.stringify({
        preview_url: "",
      }),
    });
  } catch {
    /* ignore */
  }
}

export async function POST(req: NextRequest) {
  const session = await getAuth(req);
  if (!session)
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );

  try {
    const body = await req.json();
    const { sandboxName, spProjectId } = body;

    if (!sandboxName || !body.vercelToken || !body.vercelProjectId) {
      return NextResponse.json(
        { ok: false, error: "Missing params" },
        { status: 400 },
      );
    }

    // clearProjectPreviewState below authenticates with INTERNAL_API_SECRET,
    // which skips per-user checks — verify project access first.
    if (
      spProjectId &&
      !(await canAccessProject(spProjectId, req.headers.get("cookie") ?? ""))
    ) {
      return NextResponse.json(
        { ok: false, error: "Forbidden" },
        { status: 403 },
      );
    }

    const auth = getSandboxAuth(body);

    const sandbox = await Sandbox.get({
      name: sandboxName,
      resume: false,
      ...auth,
      signal: req.signal,
      fetch: cleanVercelFetch,
    });
    const currentSession = sandbox.currentSession();

    if (currentSession.status === "running") {
      await currentSession.stop({ signal: req.signal });
    }

    if (spProjectId) {
      await clearProjectPreviewState(
        spProjectId,
        req.headers.get("cookie") ?? "",
      );
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
