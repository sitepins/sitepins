import { Sandbox } from "@vercel/sandbox";
import { getAuth } from "@/lib/auth/auth-server";
import { cleanVercelFetch, getSandboxAuth } from "@/lib/vercel-sandbox-auth";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const session = await getAuth(req);
  if (!session)
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );

  try {
    const body = await req.json();
    const { sandboxName } = body;

    if (!sandboxName || !body.vercelToken || !body.vercelProjectId) {
      return NextResponse.json(
        { ok: false, error: "Missing params" },
        { status: 400 },
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
      await currentSession.extendTimeout(5 * 60 * 1000, { signal: req.signal });
    }

    return NextResponse.json({ ok: true, status: currentSession.status });
  } catch {
    return NextResponse.json({ ok: false, status: "stopped" });
  }
}
