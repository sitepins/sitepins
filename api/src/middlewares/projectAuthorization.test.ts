import type { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ENUM_PERMISSIONS, ENUM_ROLE_ORG } from "@/enums/roles";
import orgMiddleware from "./orgMiddleware";
import { projectMiddleware } from "./projectMiddleware";

// The vulnerability: both middlewares authorized against an org id taken from
// the caller's own query string, never checking that the target project lived
// in that org. Passing `?orgId=<an org I own>` therefore granted access to any
// project in the system.
//
// These tests pin BOTH directions — the attack is refused, and every
// legitimate member/role path still passes.

const projectFindOne = vi.fn();
const orgFindOne = vi.fn();

vi.mock("@/modules/project/project.model", () => ({
  Project: { findOne: (...a: unknown[]) => projectFindOne(...a) },
}));
vi.mock("@/modules/organization/organization.model", () => ({
  Organization: { findOne: (...a: unknown[]) => orgFindOne(...a) },
}));

const ATTACKER = "@user_mallory";
const VICTIM_ORG = "org_victim";
const ATTACKER_ORG = "org_mallory";

const setProject = (org_id: string | null) =>
  projectFindOne.mockReturnValue({
    select: () => ({ lean: () => Promise.resolve(org_id ? { org_id } : null) }),
  });

const setOrg = (orgs: Record<string, { owner: string; members?: unknown[] }>) =>
  orgFindOne.mockImplementation((filter: { org_id: string }) => ({
    select: () => ({
      lean: () => Promise.resolve(orgs[filter.org_id] ?? null),
    }),
  }));

const call = async (
  mw: (req: Request, res: Response, next: NextFunction) => unknown,
  req: Partial<Request>,
) => {
  const next = vi.fn();
  await mw(
    { params: {}, query: {}, body: {}, ...req } as Request,
    {} as Response,
    next as unknown as NextFunction,
  );
  const err = next.mock.calls[0]?.[0] as { statusCode?: number } | undefined;
  return {
    allowed: next.mock.calls.length > 0 && !err,
    status: err?.statusCode,
  };
};

beforeEach(() => {
  projectFindOne.mockReset();
  orgFindOne.mockReset();
});

describe("cross-tenant project access", () => {
  it("REFUSES a project in another org even when the caller owns the org they name", async () => {
    setProject(VICTIM_ORG);
    setOrg({
      [ATTACKER_ORG]: { owner: ATTACKER },
      [VICTIM_ORG]: { owner: "@user_victim", members: [] },
    });

    const res = await call(projectMiddleware(ENUM_ROLE_ORG.OWNER), {
      user: { user_id: ATTACKER },
      params: { projectId: "VICT-1" },
      query: { orgId: ATTACKER_ORG }, // the old bypass
    } as unknown as Partial<Request>);

    expect(res.allowed).toBe(false);
    expect(res.status).toBe(403);
  });

  it("REFUSES the body variant of the same bypass", async () => {
    setProject(VICTIM_ORG);
    setOrg({
      [ATTACKER_ORG]: { owner: ATTACKER },
      [VICTIM_ORG]: { owner: "@user_victim", members: [] },
    });

    const res = await call(orgMiddleware(ENUM_PERMISSIONS.MANAGE_PROJECTS), {
      user: { user_id: ATTACKER },
      params: { projectId: "VICT-1" },
      body: { org_id: ATTACKER_ORG },
    } as unknown as Partial<Request>);

    expect(res.allowed).toBe(false);
    expect(res.status).toBe(403);
  });

  it("ALLOWS the project's real owner (no regression)", async () => {
    setProject(VICTIM_ORG);
    setOrg({ [VICTIM_ORG]: { owner: "@user_victim", members: [] } });

    const res = await call(projectMiddleware(ENUM_ROLE_ORG.OWNER), {
      user: { user_id: "@user_victim" },
      params: { projectId: "VICT-1" },
      query: { orgId: VICTIM_ORG },
    } as unknown as Partial<Request>);

    expect(res.allowed).toBe(true);
  });

  it("ALLOWS an editor member on a read route (no regression)", async () => {
    setProject(VICTIM_ORG);
    setOrg({
      [VICTIM_ORG]: {
        owner: "@user_victim",
        members: [{ user_id: "@user_ed", role: ENUM_ROLE_ORG.EDITOR }],
      },
    });

    const res = await call(
      projectMiddleware(
        ENUM_ROLE_ORG.OWNER,
        ENUM_ROLE_ORG.ADMIN,
        ENUM_ROLE_ORG.EDITOR,
      ),
      {
        user: { user_id: "@user_ed" },
        params: { project_id: "VICT-1" }, // snake_case param also resolves
      } as unknown as Partial<Request>,
    );

    expect(res.allowed).toBe(true);
  });

  it("REFUSES an editor on an owner/admin-only route", async () => {
    setProject(VICTIM_ORG);
    setOrg({
      [VICTIM_ORG]: {
        owner: "@user_victim",
        members: [{ user_id: "@user_ed", role: ENUM_ROLE_ORG.EDITOR }],
      },
    });

    const res = await call(
      projectMiddleware(ENUM_ROLE_ORG.OWNER, ENUM_ROLE_ORG.ADMIN),
      {
        user: { user_id: "@user_ed" },
        params: { projectId: "VICT-1" },
      } as unknown as Partial<Request>,
    );

    expect(res.allowed).toBe(false);
    expect(res.status).toBe(403);
  });

  it("ALLOWS org-scoped routes that carry no project id (project creation)", async () => {
    setOrg({ [ATTACKER_ORG]: { owner: ATTACKER } });

    const res = await call(
      projectMiddleware(ENUM_ROLE_ORG.OWNER, ENUM_ROLE_ORG.ADMIN),
      {
        user: { user_id: ATTACKER },
        body: { org_id: ATTACKER_ORG },
      } as unknown as Partial<Request>,
    );

    expect(res.allowed).toBe(true);
    expect(projectFindOne).not.toHaveBeenCalled();
  });

  it("404s a project that does not exist", async () => {
    setProject(null);
    const res = await call(projectMiddleware(ENUM_ROLE_ORG.OWNER), {
      user: { user_id: ATTACKER },
      params: { projectId: "nope" },
    } as unknown as Partial<Request>);
    expect(res.allowed).toBe(false);
    expect(res.status).toBe(404);
  });

  it("lets internal server-to-server callers through", async () => {
    const res = await call(projectMiddleware(ENUM_ROLE_ORG.OWNER), {
      isInternal: true,
      params: { project_id: "VICT-1" },
    } as unknown as Partial<Request>);
    expect(res.allowed).toBe(true);
    expect(projectFindOne).not.toHaveBeenCalled();
  });

  it("rejects a non-string project id instead of querying with it", async () => {
    setOrg({});
    const res = await call(projectMiddleware(ENUM_ROLE_ORG.OWNER), {
      user: { user_id: ATTACKER },
      params: { projectId: { $ne: "" } },
    } as unknown as Partial<Request>);
    expect(res.allowed).toBe(false);
    expect(projectFindOne).not.toHaveBeenCalled();
  });
});
