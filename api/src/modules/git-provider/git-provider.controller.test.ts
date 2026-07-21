import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

// getProviderController used to leak any user's OAuth tokens to any other
// authed user (IDOR). The fix — and a regression it caused, where org
// collaborators could no longer load a project's creator's git token and got
// stuck on an infinite loading skeleton — are both locked in here.
// See memory: org-id-prefix-convention / sitepins-opensource-split.

const organizationFindMock = vi.fn();
const projectExistsMock = vi.fn();
const getProviderServiceMock = vi.fn(async (userId: string) => [
  { user_id: userId, provider: "github" },
]);
const rotateProviderTokensServiceMock = vi.fn(
  async (..._args: unknown[]) => ({ _id: "row-1" }),
);

vi.mock("@/modules/organization/organization.model", () => ({
  Organization: {
    find: (...args: unknown[]) => organizationFindMock(...args),
  },
}));

vi.mock("@/modules/project/project.model", () => ({
  Project: {
    exists: (...args: unknown[]) => projectExistsMock(...args),
  },
}));

vi.mock("./git-provider.service", () => ({
  gitProviderService: {
    getProviderService: (...args: [string]) => getProviderServiceMock(...args),
    rotateProviderTokensService: (...args: unknown[]) =>
      rotateProviderTokensServiceMock(...args),
  },
}));

function mockMyOrgs(orgIds: string[]) {
  organizationFindMock.mockReturnValue({
    select: () => ({
      lean: () => Promise.resolve(orgIds.map((org_id) => ({ org_id }))),
    }),
  });
}

function makeReqRes(requesterId: string | undefined, targetId?: string) {
  const req = {
    user: requesterId ? { user_id: requesterId } : undefined,
    params: targetId !== undefined ? { userId: targetId } : {},
  } as unknown as Request;

  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const res = { status } as unknown as Response;

  return { req, res, json, status };
}

beforeEach(() => {
  organizationFindMock.mockReset();
  projectExistsMock.mockReset();
  getProviderServiceMock.mockClear();
  rotateProviderTokensServiceMock.mockClear();
});

function makeBodyReqRes(body: unknown) {
  const req = { body } as unknown as Request;
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const res = { status } as unknown as Response;
  return { req, res, json, status };
}

describe("getProviderController", () => {
  it("serves the requester's own providers when no target user is given", async () => {
    const { gitProviderController } = await import("./git-provider.controller.js");
    const { req, res } = makeReqRes("user-1");

    await gitProviderController.getProviderController(req, res, vi.fn());

    expect(getProviderServiceMock).toHaveBeenCalledWith("user-1");
    expect(organizationFindMock).not.toHaveBeenCalled();
  });

  it("serves own providers when target === requester", async () => {
    const { gitProviderController } = await import("./git-provider.controller.js");
    const { req, res } = makeReqRes("user-1", "user-1");

    await gitProviderController.getProviderController(req, res, vi.fn());

    expect(getProviderServiceMock).toHaveBeenCalledWith("user-1");
    expect(organizationFindMock).not.toHaveBeenCalled();
  });

  it("denies a stranger — falls back to the requester's own providers", async () => {
    const { gitProviderController } = await import("./git-provider.controller.js");
    mockMyOrgs([]); // requester shares no org with the target at all
    projectExistsMock.mockResolvedValue(null);
    const { req, res } = makeReqRes("stranger", "victim");

    await gitProviderController.getProviderController(req, res, vi.fn());

    expect(getProviderServiceMock).toHaveBeenCalledWith("stranger");
  });

  it("denies an org-mate with no shared project", async () => {
    const { gitProviderController } = await import("./git-provider.controller.js");
    mockMyOrgs(["org-1"]);
    projectExistsMock.mockResolvedValue(null); // no project by target in that org
    const { req, res } = makeReqRes("user-1", "user-2");

    await gitProviderController.getProviderController(req, res, vi.fn());

    expect(getProviderServiceMock).toHaveBeenCalledWith("user-1");
  });

  it("allows an org-mate to load the creator's providers for a shared project", async () => {
    const { gitProviderController } = await import("./git-provider.controller.js");
    mockMyOrgs(["org-1", "org-2"]);
    projectExistsMock.mockResolvedValue(true);
    const { req, res } = makeReqRes("collaborator", "creator");

    await gitProviderController.getProviderController(req, res, vi.fn());

    expect(projectExistsMock).toHaveBeenCalledWith({
      user_id: "creator",
      org_id: { $in: ["org-1", "org-2"] },
    });
    expect(getProviderServiceMock).toHaveBeenCalledWith("creator");
  });

  it("still allows access when the project creator has since left the org", async () => {
    // Project.exists only checks the project's own org_id/user_id, not the
    // creator's current membership — so a creator who left after creating
    // the project must not break collaborators still in that org.
    const { gitProviderController } = await import("./git-provider.controller.js");
    mockMyOrgs(["org-1"]);
    projectExistsMock.mockResolvedValue(true);
    const { req, res } = makeReqRes("member", "departed-creator");

    await gitProviderController.getProviderController(req, res, vi.fn());

    expect(getProviderServiceMock).toHaveBeenCalledWith("departed-creator");
  });
});

describe("rotateProviderController", () => {
  it("rejects a Mongo-operator object as old_refresh_token (NoSQL-injection guard)", async () => {
    const { gitProviderController } = await import("./git-provider.controller.js");
    const { req, res, status } = makeBodyReqRes({
      provider: "Github",
      old_refresh_token: { $gt: "" },
      access_token: "new-access",
      refresh_token: "new-refresh",
    });

    await gitProviderController.rotateProviderController(req, res, vi.fn());

    expect(status).toHaveBeenCalledWith(400);
    // Never reaches the DB layer with an operator filter.
    expect(rotateProviderTokensServiceMock).not.toHaveBeenCalled();
  });

  it("rejects a missing refresh token with 400", async () => {
    const { gitProviderController } = await import("./git-provider.controller.js");
    const { req, res, status } = makeBodyReqRes({
      provider: "Github",
      access_token: "new-access",
      refresh_token: "new-refresh",
    });

    await gitProviderController.rotateProviderController(req, res, vi.fn());

    expect(status).toHaveBeenCalledWith(400);
    expect(rotateProviderTokensServiceMock).not.toHaveBeenCalled();
  });

  it("rotates when all fields are valid strings and drops non-numeric expiries", async () => {
    const { gitProviderController } = await import("./git-provider.controller.js");
    const { req, res, status } = makeBodyReqRes({
      provider: "Github",
      old_refresh_token: "old-refresh",
      access_token: "new-access",
      refresh_token: "new-refresh",
      access_token_expires_at: 123456,
      refresh_token_expires_at: "not-a-number",
    });

    await gitProviderController.rotateProviderController(req, res, vi.fn());

    expect(rotateProviderTokensServiceMock).toHaveBeenCalledWith({
      provider: "Github",
      old_refresh_token: "old-refresh",
      access_token: "new-access",
      refresh_token: "new-refresh",
      access_token_expires_at: 123456,
      refresh_token_expires_at: undefined,
    });
    expect(status).toHaveBeenCalledWith(200);
  });
});
