import { getAuth } from "@/lib/auth/auth-server";
import { requestOrigin } from "@/lib/git/oauth-refresh";
import { issueProjectToken, ProjectTokenError } from "@/lib/git/project-token";
import { logger } from "@/lib/logger";
import { errorMessageOr } from "@/lib/utils/error";
import { NextRequest, NextResponse } from "next/server";

const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(request: NextRequest) {
  try {
    const session = await getAuth(request);
    const userId = session?.user.user_id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const projectId = body?.projectId;
    if (typeof projectId !== "string" || !projectId) {
      return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
    }

    const token = await issueProjectToken(
      projectId,
      userId,
      requestOrigin(request),
    );
    return NextResponse.json(token, { headers: NO_STORE });
  } catch (error) {
    const status = error instanceof ProjectTokenError ? error.status : 500;
    if (status >= 500) logger.error("Error issuing project token:", error);
    return NextResponse.json(
      { error: errorMessageOr(error, "An unexpected error occurred") },
      { status, headers: NO_STORE },
    );
  }
}
