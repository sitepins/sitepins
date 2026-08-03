import { errorMessageOr } from "@/lib/utils/error";
import { logger } from "@/lib/logger";
import { rotateProviderTokens } from "@/actions/provider";
import { getAuth } from "@/lib/auth/auth-server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    // Without a session this is an open refresh-token exchange oracle.
    const session = await getAuth(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { refresh_token } = await request.json();

    if (!refresh_token) {
      return NextResponse.json(
        { error: "Missing refresh token" },
        { status: 400 },
      );
    }

    const host = request.headers.get("host") || "localhost:3000";
    const protocol = request.headers.get("x-forwarded-proto") || "http";
    const origin = `${protocol}://${host}`;

    // Exchange refresh token for new access token
    const tokenResponse = await fetch("https://gitlab.com/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: process.env.NEXT_PUBLIC_GITLAB_CLIENT_ID,
        client_secret: process.env.GITLAB_CLIENT_SECRET,
        refresh_token,
        grant_type: "refresh_token",
        redirect_uri: `${origin}/gitlab-installed`,
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json();
      logger.error("GitLab token refresh error:", errorData);
      throw new Error(errorData.error_description || "Failed to refresh token");
    }

    const tokenData = await tokenResponse.json();

    const accessTokenExpiresAt = Date.now() + tokenData.expires_in * 1000;

    // Persist onto the row that held the consumed refresh token — the token
    // OWNER's row, which is not necessarily the session user (a collaborator
    // refreshes the project creator's token).
    try {
      await rotateProviderTokens({
        provider: "Gitlab",
        old_refresh_token: refresh_token,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        access_token_expires_at: accessTokenExpiresAt,
      });
    } catch (persistError) {
      // Still return the fresh token so the current session keeps working.
      logger.error("Failed to persist rotated GitLab tokens:", persistError);
    }

    return NextResponse.json({
      success: true,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      access_token_expires_at: accessTokenExpiresAt,
      last_refreshed_at: Date.now(), // Return current time for frontend tracking
    });
  } catch (error) {
    logger.error("Error in GitLab refresh handler:", error);
    return NextResponse.json(
      {
        error: errorMessageOr(error, "An unexpected error occurred"),
      },
      { status: 500 },
    );
  }
}
