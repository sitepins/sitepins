import { errorMessageOr } from "@/lib/utils/error";
import { logger } from "@/lib/logger";
import { createProvider } from "@/actions/provider";
import { getAuth } from "@/lib/auth/auth-server";
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
    const session = await getAuth(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    const installationId = searchParams.get("installation_id");

    if (!code) {
      return NextResponse.json({ error: "Missing code" }, { status: 400 });
    }
    if (!installationId || !/^\d+$/.test(installationId)) {
      return NextResponse.json(
        { error: "Missing or invalid installation_id" },
        { status: 400 },
      );
    }

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

    // Exchange the OAuth code FIRST: the resulting user token is what proves
    // who is calling, and it gates the installation token below.
    const token = await app.oauth.createToken({
      code,
    });

    // `installation_id` arrives in the query string, and installation ids are
    // sequential integers. Without this check, passing another org's id would
    // hand the caller an installation token with contents:write on that org's
    // repositories. Only installations this user can actually see are allowed.
    const userOctokit = new Octokit({
      auth: token.authentication.token,
      request: { headers: { "X-GitHub-Api-Version": GITHUB_API_VERSION } },
    });

    const userInstallations = await userOctokit.paginate(
      "GET /user/installations",
      { per_page: 100 },
    );

    const canAccessInstallation = userInstallations.some(
      (candidate: { id: number }) => String(candidate.id) === installationId,
    );

    if (!canAccessInstallation) {
      logger.error("GitHub installation not accessible to caller", {
        installationId,
      });
      return NextResponse.json(
        { error: "You do not have access to that GitHub installation" },
        { status: 403 },
      );
    }

    const installation = (await octokit.auth({
      type: "installation",
    })) as GitHubAppInstallation;

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
  } catch (error) {
    logger.error("Error in GitHub authentication handler:", error);
    return NextResponse.json(
      {
        error: errorMessageOr(error, "An unexpected error occurred"),
      },
      { status: 500 },
    );
  }
}

export { handler as GET, handler as POST };
