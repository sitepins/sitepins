import { createProvider } from "@/actions/provider";
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

    // Store updated provider data
    await createProvider({
      provider: "Github",
      access_token: authentication.token,
      // @ts-ignore
      refresh_token: (authentication as any).refreshToken || refresh_token,
      access_token_expires_at: accessTokenExpiresAt,
      refresh_token_expires_at: refreshTokenExpiresAt,
      token_type: authentication.tokenType as any,
      installation_access_token: "", // Keep empty to prevent overwriting existing installation token
      user_id: "", // Handled by backend/session
    });

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
