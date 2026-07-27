import { rotateProviderTokens } from "@/actions/provider";
import { NextRequest, NextResponse } from "next/server";
import { App } from "octokit";

export async function POST(request: NextRequest) {
  try {
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

    // Calculate absolute expiry times
    const accessTokenExpiresAt = authentication.expiresAt
      ? new Date(authentication.expiresAt).getTime()
      : Date.now() + 28800000; // Default to 8 hours if missing

    const refreshTokenExpiresAt = (authentication as any).refreshTokenExpiresAt
      ? new Date((authentication as any).refreshTokenExpiresAt).getTime()
      : undefined;

    // Persist onto the row that held the consumed refresh token — the token
    // OWNER's row, which is not necessarily the session user (a collaborator
    // refreshes the project creator's token). GitHub refresh tokens are
    // single-use, so failing to persist would permanently break the row.
    try {
      await rotateProviderTokens({
        provider: "Github",
        old_refresh_token: refresh_token,
        access_token: authentication.token,
        refresh_token: (authentication as any).refreshToken || refresh_token,
        access_token_expires_at: accessTokenExpiresAt,
        refresh_token_expires_at: refreshTokenExpiresAt,
      });
    } catch (persistError) {
      // Still return the fresh token so the current session keeps working.
      console.error("Failed to persist rotated GitHub tokens:", persistError);
    }

    return NextResponse.json({
      success: true,
      access_token: authentication.token,
      // @ts-ignore
      refresh_token: (authentication as any).refreshToken || refresh_token,
      access_token_expires_at: accessTokenExpiresAt,
      refresh_token_expires_at: refreshTokenExpiresAt,
      last_refreshed_at: Date.now(),
    });
  } catch (error: any) {
    console.error("Error in GitHub refresh handler:", error);
    return NextResponse.json(
      {
        error: error.message || "An unexpected error occurred",
      },
      { status: 500 },
    );
  }
}
