import { beforeEach, describe, expect, it, vi } from "vitest";

// isOrgMember gates every realtime join (socket.io rooms + Hocuspocus docs),
// so it must never be fooled by a missing org or a stranger's ids. The
// Organization model is mocked — this is a pure access-logic test, not an
// integration test against Mongo.
const findOneMock = vi.fn();

vi.mock("@/modules/organization/organization.model", () => ({
  Organization: {
    findOne: (...args: unknown[]) => findOneMock(...args),
  },
}));

function mockOrg(org: { owner: string; members?: { user_id: string }[] } | null) {
  findOneMock.mockReturnValue({
    select: () => ({
      lean: () => Promise.resolve(org),
    }),
  });
}

beforeEach(() => {
  findOneMock.mockReset();
});

describe("isOrgMember", () => {
  it("returns false when userId is missing", async () => {
    const { isOrgMember } = await import("./orgAccess.js");
    expect(await isOrgMember(undefined, "org-1")).toBe(false);
    expect(await isOrgMember(null, "org-1")).toBe(false);
  });

  it("returns false when orgId is missing", async () => {
    const { isOrgMember } = await import("./orgAccess.js");
    expect(await isOrgMember("user-1", undefined)).toBe(false);
    expect(await isOrgMember("user-1", null)).toBe(false);
  });

  it("returns false when the org doesn't exist", async () => {
    mockOrg(null);
    const { isOrgMember } = await import("./orgAccess.js");
    expect(await isOrgMember("user-1", "missing-org")).toBe(false);
  });

  it("returns true for the org owner", async () => {
    mockOrg({ owner: "user-1", members: [] });
    const { isOrgMember } = await import("./orgAccess.js");
    expect(await isOrgMember("user-1", "org-1")).toBe(true);
  });

  it("returns true for a listed member", async () => {
    mockOrg({ owner: "owner-id", members: [{ user_id: "user-2" }] });
    const { isOrgMember } = await import("./orgAccess.js");
    expect(await isOrgMember("user-2", "org-1")).toBe(true);
  });

  it("returns false for a stranger who is neither owner nor member", async () => {
    mockOrg({ owner: "owner-id", members: [{ user_id: "user-2" }] });
    const { isOrgMember } = await import("./orgAccess.js");
    expect(await isOrgMember("stranger", "org-1")).toBe(false);
  });

  it("handles an org with no members array", async () => {
    mockOrg({ owner: "owner-id" });
    const { isOrgMember } = await import("./orgAccess.js");
    expect(await isOrgMember("stranger", "org-1")).toBe(false);
  });
});
