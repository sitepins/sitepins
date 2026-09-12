import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { encrypt, tokenIndex } from "@/lib/encrypt";

// Set key for token encryption tests
process.env.SANDBOX_ENCRYPTION_KEY = "b".repeat(64);

// Mocks for DB models and services
const gitProviderFindMock = vi.fn();
const gitProviderFindOneAndUpdateMock = vi.fn();
const organizationFindMock = vi.fn();
const projectExistsMock = vi.fn();
const getProviderServiceMock = vi.fn(async (userId: string) => [
  { user_id: userId, provider: "github" },
]);
const rotateProviderTokensServiceMock = vi.fn(async (..._args: unknown[]) => ({
  _id: "row-1",
}));

vi.mock("./git-provider.model", () => ({
  GitProvider: {
    find: (...a: unknown[]) => gitProviderFindMock(...a),
    findOneAndUpdate: (...a: unknown[]) =>
      gitProviderFindOneAndUpdateMock(...a),
    findOneAndDelete: vi.fn(),
  },
}));

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

type SetCall = [unknown, { $set: Record<string, string> }];
const lastUpdate = (): Record<string, string> =>
  (gitProviderFindOneAndUpdateMock.mock.calls[0] as SetCall)[1].$set;

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

function makeBodyReqRes(body: unknown) {
  const req = { body } as unknown as Request;
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const res = { status } as unknown as Response;
  return { req, res, json, status };
}

beforeEach(() => {
  gitProviderFindMock.mockReset();
  gitProviderFindOneAndUpdateMock.mockReset();
  organizationFindMock.mockReset();
  projectExistsMock.mockReset();
  getProviderServiceMock.mockClear();
  rotateProviderTokensServiceMock.mockClear();
});

describe("Git Provider Module", () => {
  describe("Services & Token Encryption", () => {
    it("returns LEGACY PLAINTEXT rows unchanged to the client", async () => {
      const { gitProviderService } = await import("./git-provider.service.js");
      gitProviderFindMock.mockReturnValue({
        lean: () =>
          Promise.resolve([
            {
              user_id: "@user_a",
              provider: "Github",
              access_token: "gho_plaintext_legacy",
              refresh_token: "ghr_plaintext_legacy",
              installation_access_token: "ghs_plaintext_legacy",
            },
          ]),
      });

      const [row] = await gitProviderService.getProviderService("@user_a");
      expect(row?.access_token).toBe("gho_plaintext_legacy");
      expect(row?.refresh_token).toBe("ghr_plaintext_legacy");
      expect(row?.installation_access_token).toBe("ghs_plaintext_legacy");
    });

    it("decrypts already-migrated rows back to the original token", async () => {
      const { gitProviderService } = await import("./git-provider.service.js");
      gitProviderFindMock.mockReturnValue({
        lean: () =>
          Promise.resolve([
            {
              user_id: "@user_b",
              provider: "Github",
              access_token: encrypt("gho_real"),
              refresh_token: encrypt("ghr_real"),
            },
          ]),
      });

      const [row] = await gitProviderService.getProviderService("@user_b");
      expect(row?.access_token).toBe("gho_real");
      expect(row?.refresh_token).toBe("ghr_real");
    });

    it("stores tokens encrypted, never in the clear", async () => {
      const { gitProviderService } = await import("./git-provider.service.js");
      gitProviderFindOneAndUpdateMock.mockResolvedValue(null);
      await gitProviderService.createProviderService({
        user_id: "@user_c",
        provider: "Github",
        access_token: "gho_secret",
        refresh_token: "ghr_secret",
      } as never);

      const set = lastUpdate();
      expect(set.access_token).not.toBe("gho_secret");
      expect(set.refresh_token).not.toBe("ghr_secret");
      expect(set.refresh_token_index).toBe(tokenIndex("ghr_secret"));
    });

    it("rotation still matches a LEGACY PLAINTEXT row (half-migrated DB)", async () => {
      const { gitProviderService } = await import("./git-provider.service.js");
      gitProviderFindOneAndUpdateMock.mockResolvedValue(null);
      await gitProviderService.rotateProviderTokensService({
        provider: "Github",
        old_refresh_token: "ghr_legacy_plaintext",
        access_token: "gho_new",
        refresh_token: "ghr_new",
      });

      const filter = gitProviderFindOneAndUpdateMock.mock.calls[0]?.[0] as {
        $or?: Array<Record<string, unknown>>;
      };
      const clauses = JSON.stringify(filter.$or);
      expect(clauses).toContain("ghr_legacy_plaintext");
      expect(clauses).toContain(tokenIndex("ghr_legacy_plaintext") as string);
    });

    it("rotation re-seals the row and refreshes its index", async () => {
      const { gitProviderService } = await import("./git-provider.service.js");
      gitProviderFindOneAndUpdateMock.mockResolvedValue(null);
      await gitProviderService.rotateProviderTokensService({
        provider: "Github",
        old_refresh_token: "ghr_old",
        access_token: "gho_new",
        refresh_token: "ghr_new",
      });

      const set = lastUpdate();
      expect(set.access_token).not.toBe("gho_new");
      expect(set.refresh_token).not.toBe("ghr_new");
      expect(set.refresh_token_index).toBe(tokenIndex("ghr_new"));
    });

    it("survives a row whose token is undecryptable instead of throwing", async () => {
      const { gitProviderService } = await import("./git-provider.service.js");
      gitProviderFindMock.mockReturnValue({
        lean: () =>
          Promise.resolve([
            { user_id: "@user_d", provider: "Gitlab", access_token: "a:b:c" },
          ]),
      });

      const rows = await gitProviderService.getProviderService("@user_d");
      expect(rows[0]?.access_token).toBe("a:b:c");
    });
  });

  describe("Controllers", () => {
    describe("getProviderController", () => {
      it("serves the requester's own providers when no target user is given", async () => {
        gitProviderFindMock.mockReturnValue({
          lean: () => Promise.resolve([]),
        });
        const { gitProviderController } =
          await import("./git-provider.controller.js");
        const { req, res } = makeReqRes("user-1");

        await gitProviderController.getProviderController(req, res, vi.fn());

        expect(organizationFindMock).not.toHaveBeenCalled();
      });

      it("serves own providers when target === requester", async () => {
        gitProviderFindMock.mockReturnValue({
          lean: () => Promise.resolve([]),
        });
        const { gitProviderController } =
          await import("./git-provider.controller.js");
        const { req, res } = makeReqRes("user-1", "user-1");

        await gitProviderController.getProviderController(req, res, vi.fn());

        expect(organizationFindMock).not.toHaveBeenCalled();
      });

      it("denies a stranger — falls back to the requester's own providers", async () => {
        gitProviderFindMock.mockReturnValue({
          lean: () => Promise.resolve([]),
        });
        const { gitProviderController } =
          await import("./git-provider.controller.js");
        mockMyOrgs([]); // requester shares no org with the target at all
        projectExistsMock.mockResolvedValue(null);
        const { req, res } = makeReqRes("stranger", "victim");

        await gitProviderController.getProviderController(req, res, vi.fn());

        expect(gitProviderFindMock).toHaveBeenCalledWith({
          user_id: "stranger",
        });
      });

      it("denies an org-mate with no shared project", async () => {
        gitProviderFindMock.mockReturnValue({
          lean: () => Promise.resolve([]),
        });
        const { gitProviderController } =
          await import("./git-provider.controller.js");
        mockMyOrgs(["org-1"]);
        projectExistsMock.mockResolvedValue(null);
        const { req, res } = makeReqRes("user-1", "user-2");

        await gitProviderController.getProviderController(req, res, vi.fn());

        expect(gitProviderFindMock).toHaveBeenCalledWith({ user_id: "user-1" });
      });

      it("allows an org-mate to load the creator's providers for a shared project", async () => {
        gitProviderFindMock.mockReturnValue({
          lean: () => Promise.resolve([]),
        });
        const { gitProviderController } =
          await import("./git-provider.controller.js");
        mockMyOrgs(["org-1", "org-2"]);
        projectExistsMock.mockResolvedValue(true);
        const { req, res } = makeReqRes("collaborator", "creator");

        await gitProviderController.getProviderController(req, res, vi.fn());

        expect(projectExistsMock).toHaveBeenCalledWith({
          user_id: "creator",
          org_id: { $in: ["org-1", "org-2"] },
        });
        expect(gitProviderFindMock).toHaveBeenCalledWith({
          user_id: "creator",
        });
      });

      it("still allows access when the project creator has since left the org", async () => {
        gitProviderFindMock.mockReturnValue({
          lean: () => Promise.resolve([]),
        });
        const { gitProviderController } =
          await import("./git-provider.controller.js");
        mockMyOrgs(["org-1"]);
        projectExistsMock.mockResolvedValue(true);
        const { req, res } = makeReqRes("member", "departed-creator");

        await gitProviderController.getProviderController(req, res, vi.fn());

        expect(gitProviderFindMock).toHaveBeenCalledWith({
          user_id: "departed-creator",
        });
      });
    });

    describe("rotateProviderController", () => {
      it("rejects a Mongo-operator object as old_refresh_token (NoSQL-injection guard)", async () => {
        const { gitProviderController } =
          await import("./git-provider.controller.js");
        const { req, res, status } = makeBodyReqRes({
          provider: "Github",
          old_refresh_token: { $gt: "" },
          access_token: "new-access",
          refresh_token: "new-refresh",
        });

        await gitProviderController.rotateProviderController(req, res, vi.fn());

        expect(status).toHaveBeenCalledWith(400);
        expect(gitProviderFindOneAndUpdateMock).not.toHaveBeenCalled();
      });

      it("rejects a missing refresh token with 400", async () => {
        const { gitProviderController } =
          await import("./git-provider.controller.js");
        const { req, res, status } = makeBodyReqRes({
          provider: "Github",
          access_token: "new-access",
          refresh_token: "new-refresh",
        });

        await gitProviderController.rotateProviderController(req, res, vi.fn());

        expect(status).toHaveBeenCalledWith(400);
        expect(gitProviderFindOneAndUpdateMock).not.toHaveBeenCalled();
      });

      it("rotates when all fields are valid strings and drops non-numeric expiries", async () => {
        gitProviderFindOneAndUpdateMock.mockResolvedValue({ _id: "1" });
        const { gitProviderController } =
          await import("./git-provider.controller.js");
        const { req, res, status } = makeBodyReqRes({
          provider: "Github",
          old_refresh_token: "old-refresh",
          access_token: "new-access",
          refresh_token: "new-refresh",
          access_token_expires_at: 123456,
          refresh_token_expires_at: "not-a-number",
        });

        await gitProviderController.rotateProviderController(req, res, vi.fn());

        expect(status).toHaveBeenCalledWith(200);
        expect(gitProviderFindOneAndUpdateMock).toHaveBeenCalled();
      });
    });
  });
});
