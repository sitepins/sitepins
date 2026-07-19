import { createProvider } from "@/actions/provider";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");

    if (!code) {
      return NextResponse.json(
        { error: "Missing authorization code" },
        { status: 400 },
      );
    }

    const host = request.headers.get("host") || "localhost:3000";
    const protocol = request.headers.get("x-forwarded-proto") || "http";
    const origin = `${protocol}://${host}`;

    // Exchange code for access token
    const tokenResponse = await fetch("https://gitlab.com/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: process.env.NEXT_PUBLIC_GITLAB_CLIENT_ID,
        client_secret: process.env.GITLAB_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: `${origin}/gitlab-installed`,
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json();
      console.error("GitLab token exchange error:", errorData);
      throw new Error(
        errorData.error_description || "Failed to exchange token",
      );
    }

    const tokenData = await tokenResponse.json();
    console.log("GitLab token response received successfully");

    // Store provider data
    await createProvider({
      provider: "Gitlab",
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || "", // Ensure refresh_token is passed
      access_token_expires_at: Date.now() + tokenData.expires_in * 1000,
      token_type: tokenData.token_type,
      installation_access_token: "", // Not applicable for GitLab OAuth
      user_id: "", // Handled by backend from session
    });

    console.log("GitLab provider stored successfully via createProvider");

    return NextResponse.json({
      success: true,
      message: "GitLab authentication successful",
    });
  } catch (error: any) {
    console.error("Error in GitLab authentication handler:", error);
    return NextResponse.json(
      {
        error: error.message || "An unexpected error occurred",
      },
      { status: 500 },
    );
  }
}
