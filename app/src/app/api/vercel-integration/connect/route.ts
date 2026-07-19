import { getAuth } from "@/lib/auth/auth-server";
import { NextRequest, NextResponse } from "next/server";

const VERCEL_API = "https://api.vercel.com";

async function vercelFetch(
  path: string,
  token: string,
  opts: RequestInit = {},
) {
  const res = await fetch(`${VERCEL_API}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(opts.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? `Vercel API error ${res.status}`);
  }
  return res.json();
}

export async function POST(req: NextRequest) {
  const auth = await getAuth(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { token } = await req.json();

    if (!token) {
      return NextResponse.json({ error: "token is required" }, { status: 400 });
    }

    // Validate token + get user info
    const user = await vercelFetch("/v2/user", token);
    const userId: string = user.user?.id ?? "";
    const username: string =
      user.user?.username ?? user.user?.name ?? "unknown";

    // Fetch teams — filter out personal workspace entries
    let teams: { id: string; name: string; slug: string }[] = [];
    try {
      const teamsRes = await vercelFetch("/v2/teams", token);
      teams = (teamsRes?.teams ?? [])
        .filter(
          (t: any) =>
            t.id !== userId &&
            t.slug !== "personal" &&
            t.slug !== username &&
            t.type !== "user" &&
            !t.id?.startsWith("user_"),
        )
        .map((t: any) => ({ id: t.id, name: t.name, slug: t.slug }));
    } catch {
      // personal account — no teams
    }

    return NextResponse.json({ username, teams });
  } catch (error: any) {
    console.error("[vercel-integration/connect]", error);
    return NextResponse.json(
      { error: error?.message ?? "Failed to connect Vercel" },
      { status: 400 },
    );
  }
}
