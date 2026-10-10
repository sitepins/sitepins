import { errorMessageOr } from "@/lib/utils/error";
import { logger } from "@/lib/logger";
import { getProviders, rotateProviderTokens } from "@/actions/provider";
import { getAuth } from "@/lib/auth/auth-server";
import { refreshGitHubUserToken } from "@/lib/git/oauth-refresh";
import { isGitHubProvider } from "@/lib/utils/provider-checker";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    // Without a session this is an open refresh-token exchange oracle.
    const session = await getAuth(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { refresh_token } = await request.json();

    if (!refresh_token || typeof refresh_token !== "string") {
      return NextResponse.json(
        { error: "Missing refresh token" },
        { status: 400 },
      );
    }

    // Only the caller's own token: project members get /api/auth/project-token.
    const own = await getProviders();
    const ownsToken = own?.some(
      (row) =>
        isGitHubProvider(row.provider) && row.refresh_token === refresh_token,
    );
    if (!ownsToken) {
      return NextResponse.json(
        { error: "Refresh token does not belong to you" },
        { status: 403 },
      );
    }

    const fresh = await refreshGitHubUserToken(refresh_token);

    // GitHub refresh tokens are single-use, so failing to persist would
    // permanently break the row.
    try {
      await rotateProviderTokens({
        provider: "Github",
        old_refresh_token: refresh_token,
        ...fresh,
      });
    } catch (persistError) {
      // Still return the fresh token so the current session keeps working.
      logger.error("Failed to persist rotated GitHub tokens:", persistError);
    }

    return NextResponse.json({
      success: true,
      ...fresh,
      last_refreshed_at: Date.now(),
    });
  } catch (error) {
    logger.error("Error in GitHub refresh handler:", error);
    return NextResponse.json(
      {
        error: errorMessageOr(error, "An unexpected error occurred"),
      },
      { status: 500 },
    );
  }
}
