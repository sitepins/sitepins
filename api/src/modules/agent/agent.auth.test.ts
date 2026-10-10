import { beforeEach, describe, expect, it, vi } from "vitest";
import { agentTokenIndex, authenticateAgent } from "./agent.auth";
import { EAgentScope, EAgentWriteMode } from "./agent.type";

const m = vi.hoisted(() => ({
  grantFindOne: vi.fn(),
  userFindOne: vi.fn(),
  requireOrgAccess: vi.fn(),
  lean:
    (fn: (...a: unknown[]) => unknown) =>
    (...a: unknown[]) => ({
      select: () => ({ lean: () => fn(...a) }),
      lean: () => fn(...a),
    }),
}));

vi.mock("./agent-grant.model", () => ({
  AgentGrant: {
    findOne: m.lean((...a) => m.grantFindOne(...a)),
    updateOne: () => ({ catch: () => undefined }),
  },
}));
vi.mock("@/modules/user/user.model", () => ({
  User: { findOne: m.lean((...a) => m.userFindOne(...a)) },
}));
vi.mock("@/lib/resourceAuth", () => ({
  requireOrgAccess: (...a: unknown[]) => m.requireOrgAccess(...a),
}));

const GRANT = {
  grant_id: "g1",
  user_id: "u1",
  token_index: "x",
  token_hint: "spat_abcd",
  name: "Claude Code",
  org_id: "org-1",
  project_ids: ["p1"],
  scopes: [EAgentScope.PROJECTS_READ, EAgentScope.CONTENT_READ],
  write_mode: EAgentWriteMode.DIRECT,
  expires_at: new Date(Date.now() + 86_400_000),
};
const USER = { user_id: "u1", full_name: "Ada", email: "ada@example.com" };

beforeEach(() => {
  m.grantFindOne.mockReset().mockResolvedValue(GRANT);
  m.userFindOne.mockReset().mockResolvedValue(USER);
  m.requireOrgAccess.mockReset().mockResolvedValue({ role: "editor" });
});

describe("authenticateAgent", () => {
  it("looks tokens up by hash only and resolves the user's access", async () => {
    const agent = await authenticateAgent("Bearer spat_secret");

    expect(m.grantFindOne).toHaveBeenCalledWith({
      token_index: agentTokenIndex("spat_secret"),
    });
    expect(agentTokenIndex("spat_secret")).not.toContain("spat_secret");
    expect(agent).toMatchObject({ user_id: "u1", client_name: "Claude Code" });
    expect([...agent.scopes]).toEqual(GRANT.scopes);
  });

  it.each([
    ["no header", undefined],
    ["a non-Sitepins token", "Bearer ghp_abc"],
    ["a non-Bearer scheme", "Basic spat_x"],
  ])("rejects %s", async (_label, header) => {
    await expect(authenticateAgent(header)).rejects.toMatchObject({
      statusCode: 401,
    });
    expect(m.grantFindOne).not.toHaveBeenCalled();
  });

  it.each([
    ["unknown or revoked", null],
    ["expired", { ...GRANT, expires_at: new Date(Date.now() - 1000) }],
  ])("rejects %s tokens", async (_label, grant) => {
    m.grantFindOne.mockResolvedValue(grant);
    await expect(authenticateAgent("Bearer spat_x")).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it("cuts off a user who left the organization", async () => {
    m.requireOrgAccess.mockRejectedValue(new Error("not a member"));
    await expect(authenticateAgent("Bearer spat_x")).rejects.toMatchObject({
      statusCode: 403,
    });
  });
});
