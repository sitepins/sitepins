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
    const err: any = new Error(
      body?.error?.message ?? `Vercel API error ${res.status}`,
    );
    err.status = res.status;
    err.code = body?.error?.code;
    throw err;
  }
  return res.json();
}

export async function POST(req: NextRequest) {
  const auth = await getAuth(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { token, teamId, projectName } = await req.json();

    if (!token || !projectName) {
      return NextResponse.json(
        { error: "token and projectName are required" },
        { status: 400 },
      );
    }

    const teamQuery = teamId ? `?teamId=${teamId}` : "";
    const listQuery = teamId ? `?teamId=${teamId}&limit=100` : "?limit=100";

    try {
      const created = await vercelFetch(`/v9/projects${teamQuery}`, token, {
        method: "POST",
        body: JSON.stringify({ name: projectName, framework: null }),
      });
      return NextResponse.json({ id: created.id, name: created.name });
    } catch (createErr: any) {
      // Name conflict — find and reuse existing project
      if (
        createErr.code === "project_already_exists" ||
        createErr.status === 409
      ) {
        const listRes = await vercelFetch(`/v9/projects${listQuery}`, token);
        const existing = (listRes?.projects ?? []).find(
          (p: any) => p.name === projectName,
        );
        if (existing) {
          return NextResponse.json({ id: existing.id, name: existing.name });
        }
      }
      throw createErr;
    }
  } catch (error: any) {
    console.error("[vercel-integration/create-project]", error);
    return NextResponse.json(
      { error: error?.message ?? "Failed to create project" },
      { status: 400 },
    );
  }
}
