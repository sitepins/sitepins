import { requestOrigin } from "@/lib/git/oauth-refresh";
import { issueProjectToken, ProjectTokenError } from "@/lib/git/project-token";
import { logger } from "@/lib/logger";
import { errorMessageOr } from "@/lib/utils/error";
import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

const NO_STORE = { "Cache-Control": "no-store" };

const isInternal = (request: NextRequest) => {
  const expected = process.env.INTERNAL_API_SECRET;
  const candidate = request.headers.get("x-internal-secret");
  if (!expected || !candidate) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

/** Server-to-server: the API asks for a project's git token on behalf of an AI agent's user. */
export async function POST(request: NextRequest) {
  if (!isInternal(request)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }
  try {
    const body = await request.json().catch(() => null);
    const projectId = body?.projectId;
    const userId = body?.userId;
    if (
      typeof projectId !== "string" ||
      !projectId ||
      typeof userId !== "string" ||
      !userId
    ) {
      return NextResponse.json(
        { error: "projectId and userId are required" },
        { status: 400 },
      );
    }
    const token = await issueProjectToken(
      projectId,
      userId,
      requestOrigin(request),
    );
    return NextResponse.json(token, { headers: NO_STORE });
  } catch (error) {
    const status = error instanceof ProjectTokenError ? error.status : 500;
    if (status >= 500)
      logger.error("Error issuing internal project token:", error);
    return NextResponse.json(
      { error: errorMessageOr(error, "An unexpected error occurred") },
      { status, headers: NO_STORE },
    );
  }
}
