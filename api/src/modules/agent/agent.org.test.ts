import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getOrganization,
  inviteMember,
  removeMember,
  updateMemberRole,
} from "./agent.org";
import { EAgentScope, EAgentWriteMode, TAgentContext } from "./agent.type";

const m = vi.hoisted(() => ({
  requireOrgPermission: vi.fn(),
  runPolicyGuard: vi.fn(),
  runAgentAccessGuard: vi.fn(),
  addTeamMemberService: vi.fn(),
  updateRoleService: vi.fn(),
  removeTeamMemberService: vi.fn(),
  org: {} as Record<string, unknown>,
  users: [] as Record<string, unknown>[],
}));

const chain = (value: () => unknown) => ({
  select: () => ({ lean: async () => value() }),
});

vi.mock("@/lib/resourceAuth", () => ({
  requireOrgPermission: (...a: unknown[]) => m.requireOrgPermission(...a),
}));
vi.mock("@/lib/extensionGuards", () => ({
  runPolicyGuard: (...a: unknown[]) => m.runPolicyGuard(...a),
  runAgentAccessGuard: (...a: unknown[]) => m.runAgentAccessGuard(...a),
}));
vi.mock("@/modules/organization/organization.model", () => ({
  Organization: { findOne: () => chain(() => m.org) },
}));
vi.mock("@/modules/project/project.model", () => ({
  Project: { countDocuments: async () => 4 },
}));
vi.mock("@/modules/user/user.model", () => ({
  User: {
    find: () => chain(() => m.users),
    findOne: ({ user_id }: { user_id: string }) =>
      chain(() => m.users.find((u) => u.user_id === user_id) ?? null),
  },
}));
vi.mock("@/modules/organization/organization.service", () => ({
  organizationService: {
    addTeamMemberService: (...a: unknown[]) => m.addTeamMemberService(...a),
    updateRoleService: (...a: unknown[]) => m.updateRoleService(...a),
    removeTeamMemberService: (...a: unknown[]) =>
      m.removeTeamMemberService(...a),
  },
}));

const agent = (scopes: EAgentScope[]): TAgentContext => ({
  user_id: "admin-1",
  user_name: "Ada",
  user_email: "ada@example.com",
  client_name: "Claude Code",
  token: "t",
  scopes: new Set(scopes),
  grant: {
    grant_id: "g1",
    user_id: "admin-1",
    token_index: "x",
    token_hint: "spat_abcd",
    name: "Claude Code",
    org_id: "org-1",
    project_ids: [],
    all_projects: true,
    scopes,
    write_mode: EAgentWriteMode.DIRECT,
  },
});

const READER = agent([EAgentScope.ORG_READ]);
const MANAGER = agent([EAgentScope.MEMBERS_WRITE]);

beforeEach(() => {
  for (const fn of Object.values(m)) {
    if (typeof fn === "function" && "mockReset" in fn) fn.mockReset();
  }
  m.requireOrgPermission.mockResolvedValue({ role: "admin" });
  m.org = {
    org_id: "org-1",
    org_name: "Acme",
    owner: "owner-1",
    status: "active",
    default: false,
    members: [
      { user_id: "owner-1", email: "boss@acme.test", role: "admin" },
      { user_id: "admin-1", email: "ada@example.com", role: "admin" },
      { email: "new@acme.test", role: "editor", status: "pending" },
    ],
  };
  m.users = [
    { user_id: "owner-1", full_name: "Boss", email: "Boss@acme.test" },
    { user_id: "admin-1", full_name: "Ada", email: "ada@example.com" },
  ];
});

describe("getOrganization", () => {
  it("lists members apart from the owner, with pending invites", async () => {
    const result = await getOrganization(READER);
    expect(result).toMatchObject({
      name: "Acme",
      your_role: "admin",
      owner: { user_id: "owner-1", name: "Boss" },
      project_count: 4,
    });
    expect(result.members).toEqual([
      {
        user_id: "admin-1",
        name: "Ada",
        email: "ada@example.com",
        role: "admin",
        status: "active",
      },
      {
        name: undefined,
        email: "new@acme.test",
        role: "editor",
        status: "pending",
      },
    ]);
  });

  it("needs org:read", async () => {
    await expect(getOrganization(MANAGER)).rejects.toMatchObject({
      statusCode: 403,
    });
  });
});

describe("member changes", () => {
  it("checks permission, plan policy and agent access before inviting", async () => {
    await inviteMember(MANAGER, { email: "x@acme.test", role: "editor" });
    expect(m.requireOrgPermission).toHaveBeenCalledWith(
      "admin-1",
      "org-1",
      "manage_members",
    );
    expect(m.runAgentAccessGuard).toHaveBeenCalledWith(
      expect.objectContaining({ project_owner_id: "owner-1", write: true }),
    );
    expect(m.runPolicyGuard).toHaveBeenCalledWith({
      event: "organization:member:add",
      user_id: "admin-1",
      org_id: "org-1",
    });
    expect(m.addTeamMemberService).toHaveBeenCalledWith({
      org_id: "org-1",
      teamMember: { email: "x@acme.test", role: "editor" },
      loggedInUserId: "admin-1",
    });
  });

  it("invites nobody when the policy refuses", async () => {
    m.runPolicyGuard.mockRejectedValue(new Error("Member limit reached"));
    await expect(
      inviteMember(MANAGER, { email: "x@acme.test", role: "editor" }),
    ).rejects.toThrow("Member limit reached");
    expect(m.addTeamMemberService).not.toHaveBeenCalled();
  });

  it("needs members:write and the manage_members permission", async () => {
    await expect(
      removeMember(READER, { member: "admin-2" }),
    ).rejects.toMatchObject({ statusCode: 403 });
    m.requireOrgPermission.mockRejectedValue(
      Object.assign(new Error("nope"), { statusCode: 403 }),
    );
    await expect(
      removeMember(MANAGER, { member: "admin-2" }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(m.removeTeamMemberService).not.toHaveBeenCalled();
  });

  it.each(["owner-1", "boss@acme.test"])(
    "never touches the owner (%s)",
    async (member) => {
      await expect(
        updateMemberRole(MANAGER, { member, role: "editor" }),
      ).rejects.toMatchObject({ statusCode: 403 });
      await expect(removeMember(MANAGER, { member })).rejects.toMatchObject({
        statusCode: 403,
      });
      expect(m.updateRoleService).not.toHaveBeenCalled();
      expect(m.removeTeamMemberService).not.toHaveBeenCalled();
    },
  );

  it("changes a role and removes a pending invite by email", async () => {
    await updateMemberRole(MANAGER, { member: "admin-1", role: "editor" });
    expect(m.updateRoleService).toHaveBeenCalledWith({
      org_id: "org-1",
      teamMember: { user_id: "admin-1", role: "editor" },
      loggedInUserId: "admin-1",
    });
    await removeMember(MANAGER, { member: "new@acme.test" });
    expect(m.removeTeamMemberService).toHaveBeenCalledWith({
      org_id: "org-1",
      userId: "new@acme.test",
      loggedInUserId: "admin-1",
    });
  });
});
