import { errorMessageOr } from "@/lib/utils/error";
import { logger } from "@/lib/logger";
import { rotateProviderTokens } from "@/actions/provider";
import { getAuth } from "@/lib/auth/auth-server";
import { NextRequest, NextResponse } from "next/server";
import { App } from "octokit";

// GitHub returns these for expiring-token apps; octokit's types omit them.
type TExpiringTokenFields = {
  refreshToken?: string;
  refreshTokenExpiresAt?: string;
};

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

    const app = new App({
      oauth: {
        clientId: process.env.GITHUB_APP_CLIENT_ID!,
        clientSecret: process.env.GITHUB_APP_CLIENT_SECRET!,
      },
      appId: process.env.GITHUB_APP_ID!,
      privateKey: process.env.GITHUB_APP_PRIVATE_KEY!,
    });

    // Exchange refresh token for new access token
    const { authentication } = await app.oauth.refreshToken({
      refreshToken: refresh_token,
    });

    const auth = authentication as typeof authentication & TExpiringTokenFields;

    // Calculate absolute expiry times
    const accessTokenExpiresAt = auth.expiresAt
      ? new Date(auth.expiresAt).getTime()
      : Date.now() + 28800000; // Default to 8 hours if missing

    const refreshTokenExpiresAt = auth.refreshTokenExpiresAt
      ? new Date(auth.refreshTokenExpiresAt).getTime()
      : undefined;

    // Persist onto the row that held the consumed refresh token — the token
    // OWNER's row, which is not necessarily the session user (a collaborator
    // refreshes the project creator's token). GitHub refresh tokens are
    // single-use, so failing to persist would permanently break the row.
    try {
      await rotateProviderTokens({
        provider: "Github",
        old_refresh_token: refresh_token,
        access_token: auth.token,
        refresh_token: auth.refreshToken || refresh_token,
        access_token_expires_at: accessTokenExpiresAt,
        refresh_token_expires_at: refreshTokenExpiresAt,
      });
    } catch (persistError) {
      // Still return the fresh token so the current session keeps working.
      logger.error("Failed to persist rotated GitHub tokens:", persistError);
    }

    return NextResponse.json({
      success: true,
      access_token: auth.token,
      refresh_token: auth.refreshToken || refresh_token,
      access_token_expires_at: accessTokenExpiresAt,
      refresh_token_expires_at: refreshTokenExpiresAt,
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
