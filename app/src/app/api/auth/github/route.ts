import { createProvider } from "@/actions/provider";
import { GITHUB_API_VERSION } from "@/lib/constant";
import { createAppAuth } from "@octokit/auth-app";
import { NextRequest, NextResponse } from "next/server";
import { App, Octokit } from "octokit";

type GitHubAppInstallation = {
  type: "token";
  tokenType: "installation";
  token: string;
  installationId: number;
  permissions: {
    actions: "write";
    administration: "write";
    attestations: "write";
    checks: "write";
    codespaces: "write";
    codespaces_lifecycle_admin: "write";
    contents: "write";
    metadata: "read";
    pull_requests: "write";
    repository_advisories: "write";
    repository_custom_properties: "write";
    security_events: "write";
    statuses: "write";
  };
  createdAt: string; // ISO timestamp
  expiresAt: string; // ISO timestamp
  repositorySelection: "all" | "selected";
};

export type GitHubAppOAuthAuthentication = {
  type: "token";
  tokenType: "oauth";
  clientType: "github-app";
  clientId: string;
  clientSecret: string;
  token: string;
  refreshToken: string;
  expiresAt: string;
  refreshTokenExpiresAt: string; // ISO date string
};

async function handler(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const installationId = searchParams.get("installation_id");

    const octokit: Octokit = new Octokit({
      authStrategy: createAppAuth,
      version: GITHUB_API_VERSION,
      auth: {
        appId: process.env.GITHUB_APP_ID!,
        privateKey: process.env.GITHUB_APP_PRIVATE_KEY!,
        installationId,
      },
      request: {
        headers: {
          "X-GitHub-Api-Version": GITHUB_API_VERSION,
        },
      },
      // log: {
      //   warn: () => {},
      //   info: () => {},
      //   debug: () => {},
      //   error: console.error,
      // },
    });

    const app = new App({
      oauth: {
        clientId: process.env.GITHUB_APP_CLIENT_ID!,
        clientSecret: process.env.GITHUB_APP_CLIENT_SECRET!,
      },
      appId: process.env.GITHUB_APP_ID!,
      privateKey: process.env.GITHUB_APP_PRIVATE_KEY!,
    });

    const installation = (await octokit.auth({
      type: "installation",
    })) as GitHubAppInstallation;

    const token = await app.oauth.createToken({
      code: code!,
    });

    await createProvider({
      provider: "Github",
      access_token: token.authentication.token,
      refresh_token: (token.authentication as any).refreshToken || "", // Pass refreshToken if available
      access_token_expires_at: (token.authentication as any).expiresAt
        ? new Date((token.authentication as any).expiresAt).getTime()
        : Date.now() + 28800000, // Default to 8h if missing
      refresh_token_expires_at: (token.authentication as any)
        .refreshTokenExpiresAt
        ? new Date(
            (token.authentication as any).refreshTokenExpiresAt,
          ).getTime()
        : undefined,
      token_type: installation.tokenType,
      installation_access_token: installation.token,
      user_id: "",
    });

    return NextResponse.json({
      success: true,
      message: "GitHub authentication successful",
    });
  } catch (error: any) {
    console.error("Error in GitHub authentication handler:", error);
    return NextResponse.json(
      {
        error: error.message || "An unexpected error occurred",
      },
      { status: 500 },
    );
  }
}

export { handler as GET, handler as POST };
