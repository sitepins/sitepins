import { setAgentAccessGuard } from "@/lib/extensionGuards";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTokenGrant, revokeGrant } from "./agent-grant.service";
import { EAgentScope } from "./agent.type";

const m = vi.hoisted(() => ({
  requireOrgAccess: vi.fn(),
  projectCount: vi.fn(),
  grantCreate: vi.fn(),
  grantUpdate: vi.fn(),
  orgFindOne: vi.fn(),
}));

vi.mock("@/lib/resourceAuth", () => ({
  requireOrgAccess: (...a: unknown[]) => m.requireOrgAccess(...a),
}));
vi.mock("@/lib/nanoId", () => ({ nanoId: async () => "grant-id" }));
vi.mock("@/modules/project/project.model", () => ({
  Project: {
    find: (...a: unknown[]) => ({
      select: () => ({ lean: () => m.projectCount(...a) }),
    }),
  },
}));
vi.mock("@/modules/organization/organization.model", () => ({
  Organization: {
    findOne: (...a: unknown[]) => ({
      select: () => ({ lean: () => m.orgFindOne(...a) }),
    }),
  },
}));
vi.mock("./agent-grant.model", () => ({
  AgentGrant: {
    create: (...a: unknown[]) => m.grantCreate(...a),
    findOneAndDelete: (...a: unknown[]) => ({
      lean: () => m.grantUpdate(...a),
    }),
  },
}));

const INPUT = {
  name: "Claude Code",
  expires_in_days: 30,
  org_id: "org-1",
  project_ids: ["p1", "p2"],
  scopes: [EAgentScope.CONTENT_READ, EAgentScope.CONTENT_WRITE],
  write_mode: "direct",
};

beforeEach(() => {
  m.requireOrgAccess.mockReset().mockResolvedValue({ role: "editor" });
  m.projectCount.mockReset().mockResolvedValue([
    { project_id: "p1", user_id: "owner" },
    { project_id: "p2", user_id: "owner" },
  ]);
  m.grantCreate.mockReset();
  m.grantUpdate.mockReset();
});

describe("createTokenGrant", () => {
  it("returns the token once and stores only its hash", async () => {
    const { token, grant } = await createTokenGrant("u1", INPUT);

    expect(token).toMatch(/^spat_[A-Za-z0-9_-]{43}$/);
    const stored = m.grantCreate.mock.calls[0][0];
    expect(JSON.stringify(stored)).not.toContain(token);
    expect(stored.token_index).toMatch(/^[0-9a-f]{64}$/);
    expect(grant).not.toHaveProperty("token_index");
    expect(stored.expires_at.getTime()).toBeGreaterThan(
      Date.now() + 29 * 86_400_000,
    );
  });

  it("refuses projects outside the organization and organizations the user isn't in", async () => {
    m.projectCount.mockResolvedValue([{ project_id: "p1", user_id: "owner" }]);
    await expect(createTokenGrant("u1", INPUT)).rejects.toMatchObject({
      statusCode: 400,
    });
    m.requireOrgAccess.mockRejectedValue(
      Object.assign(new Error("no"), { statusCode: 403 }),
    );
    await expect(createTokenGrant("u1", INPUT)).rejects.toThrow();
    expect(m.grantCreate).not.toHaveBeenCalled();
  });

  it("stores an all-sites grant without a project list and checks access against the org owner", async () => {
    m.orgFindOne.mockResolvedValue({ owner: "owner-1" });
    const checks: unknown[] = [];
    setAgentAccessGuard((check) => {
      checks.push(check);
    });
    try {
      await createTokenGrant("u1", {
        ...INPUT,
        project_ids: ["ignored"],
        all_projects: true,
      });
    } finally {
      setAgentAccessGuard(() => undefined);
    }
    expect(m.grantCreate.mock.calls[0][0]).toMatchObject({
      all_projects: true,
      project_ids: [],
    });
    expect(checks).toEqual([
      {
        user_id: "u1",
        org_id: "org-1",
        project_owner_id: "owner-1",
        write: false,
      },
    ]);
  });

  it("needs at least one site unless the grant covers all of them", async () => {
    await expect(
      createTokenGrant("u1", { ...INPUT, project_ids: [] }),
    ).rejects.toThrow(/at least one site/);
  });

  it("caps token lifetime at 90 days and rejects unknown scopes", async () => {
    await expect(
      createTokenGrant("u1", { ...INPUT, expires_in_days: 365 }),
    ).rejects.toThrow();
    await expect(
      createTokenGrant("u1", { ...INPUT, scopes: ["admin:all"] }),
    ).rejects.toThrow();
  });
});

it("refuses to create a token the deployment wouldn't let the agent use", async () => {
  setAgentAccessGuard(() => {
    throw Object.assign(
      new Error("AI agent access needs the Pro plan or higher."),
      {
        statusCode: 402,
      },
    );
  });
  try {
    await expect(createTokenGrant("u1", INPUT)).rejects.toThrow(/Pro plan/);
    expect(m.grantCreate).not.toHaveBeenCalled();
  } finally {
    setAgentAccessGuard(() => undefined);
  }
});

describe("revokeGrant", () => {
  it("only revokes the caller's own token", async () => {
    m.grantUpdate.mockResolvedValue({ grant_id: "g1" });
    await revokeGrant("u1", "g1");
    expect(m.grantUpdate.mock.calls[0][0]).toMatchObject({
      grant_id: "g1",
      user_id: "u1",
    });

    m.grantUpdate.mockResolvedValue(null);
    await expect(revokeGrant("u2", "g1")).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});
