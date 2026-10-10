import { encrypt, tokenIndex } from "@/lib/encrypt";
import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Set key for token encryption tests
process.env.SANDBOX_ENCRYPTION_KEY = "b".repeat(64);

// Mocks for DB models and services
const gitProviderFindMock = vi.fn();
const gitProviderFindOneAndUpdateMock = vi.fn();
const organizationFindMock = vi.fn();
const projectExistsMock = vi.fn();
const projectFindOneMock = vi.fn();
const requireOrgRoleMock = vi.fn();
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
    findOne: (...args: unknown[]) => projectFindOneMock(...args),
  },
}));

vi.mock("@/lib/resourceAuth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/resourceAuth")>()),
  requireOrgRole: (...args: unknown[]) => requireOrgRoleMock(...args),
}));

const OWNER_ROWS = [
  {
    user_id: "creator",
    provider: "Github",
    access_token: "gho_owner",
    refresh_token: "ghr_owner",
    refresh_token_index: "idx_gh",
    refresh_token_expires_at: new Date(0),
    installation_access_token: "ghs_owner",
  },
  {
    user_id: "creator",
    provider: "Gitlab",
    access_token: "glpat_owner",
    refresh_token: "glrt_owner",
    refresh_token_index: "idx_gl",
    refresh_token_expires_at: new Date(0),
  },
];

const mockProviderRows = (rows: unknown[]) =>
  gitProviderFindMock.mockReturnValue({
    lean: () => Promise.resolve(rows.map((r) => ({ ...(r as object) }))),
  });

type TSentResult = { result: Array<Record<string, unknown>> };
const sentResult = (json: ReturnType<typeof vi.fn>) =>
  (json.mock.calls[0]?.[0] as TSentResult).result;

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

function makeBodyReqRes(
  body: unknown,
  extra: Partial<Pick<Request, "user" | "isInternal">> = {
    user: { user_id: "user-1" } as never,
  },
) {
  const req = { body, ...extra } as unknown as Request;
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
  projectFindOneMock.mockReset();
  requireOrgRoleMock.mockReset();
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
      it("never returns refresh tokens or GitHub access tokens to a collaborator", async () => {
        mockProviderRows(OWNER_ROWS);
        const { gitProviderController } =
          await import("./git-provider.controller.js");
        mockMyOrgs(["org-1"]);
        projectExistsMock.mockResolvedValue(true);
        const { req, res, json } = makeReqRes("collaborator", "creator");

        await gitProviderController.getProviderController(req, res, vi.fn());

        const [github, gitlab] = sentResult(json);
        for (const row of [github, gitlab]) {
          expect(row).not.toHaveProperty("refresh_token");
          expect(row).not.toHaveProperty("refresh_token_index");
          expect(row).not.toHaveProperty("refresh_token_expires_at");
        }
        expect(github?.access_token).toBe("");
        expect(github?.installation_access_token).toBe("");
        expect(github?.provider).toBe("Github");
        expect(gitlab?.access_token).toBe("glpat_owner");
        expect(JSON.stringify(sentResult(json))).not.toMatch(
          /ghr_owner|glrt_owner|gho_owner|ghs_owner/,
        );
      });

      it("keeps the owner's own tokens but drops the refresh-token index", async () => {
        mockProviderRows(OWNER_ROWS);
        const { gitProviderController } =
          await import("./git-provider.controller.js");
        const { req, res, json } = makeReqRes("creator", "creator");

        await gitProviderController.getProviderController(req, res, vi.fn());

        const [github] = sentResult(json);
        expect(github?.access_token).toBe("gho_owner");
        expect(github?.refresh_token).toBe("ghr_owner");
        expect(github).not.toHaveProperty("refresh_token_index");
      });
    });

    describe("getProjectGrantController", () => {
      const mockProject = (project: unknown) =>
        projectFindOneMock.mockReturnValue({
          select: () => ({ lean: () => Promise.resolve(project) }),
        });

      const makeGrantReq = (projectId: unknown, userId: unknown) => {
        const req = {
          params: { projectId },
          query: { user_id: userId },
          isInternal: true,
        } as unknown as Request;
        const json = vi.fn();
        const status = vi.fn(() => ({ json }));
        return { req, res: { status } as unknown as Response, json, status };
      };

      it("rejects a caller who is not a member of the project's org", async () => {
        mockProject({
          user_id: "creator",
          org_id: "org-1",
          provider: "Github",
          repository: "acme/site",
        });
        requireOrgRoleMock.mockRejectedValue(
          Object.assign(new Error("denied"), { statusCode: 403 }),
        );
        const { gitProviderController } =
          await import("./git-provider.controller.js");
        const { req, res, status } = makeGrantReq("p1", "outsider");
        const next = vi.fn();

        await gitProviderController.getProjectGrantController(req, res, next);

        expect(requireOrgRoleMock).toHaveBeenCalledWith(
          "outsider",
          "org-1",
          expect.any(Array),
        );
        expect(next).toHaveBeenCalledWith(expect.any(Error));
        expect(status).not.toHaveBeenCalled();
        expect(gitProviderFindMock).not.toHaveBeenCalled();
      });

      it("rejects operator objects as ids", async () => {
        const { gitProviderController } =
          await import("./git-provider.controller.js");
        const { req, res, status } = makeGrantReq({ $ne: "" }, "member");

        await gitProviderController.getProjectGrantController(
          req,
          res,
          vi.fn(),
        );

        expect(status).toHaveBeenCalledWith(400);
        expect(projectFindOneMock).not.toHaveBeenCalled();
      });

      it("returns the creator's row for the project's provider to a member", async () => {
        mockProject({
          user_id: "creator",
          org_id: "org-1",
          provider: "github",
          repository: "acme/site",
        });
        requireOrgRoleMock.mockResolvedValue({ role: "editor" });
        mockProviderRows(OWNER_ROWS);
        const { gitProviderController } =
          await import("./git-provider.controller.js");
        const { req, res, json } = makeGrantReq("p1", "member");

        await gitProviderController.getProjectGrantController(
          req,
          res,
          vi.fn(),
        );

        const grant = (json.mock.calls[0]?.[0] as { result: unknown }).result;
        expect(grant).toMatchObject({
          provider: "Github",
          repository: "acme/site",
          owner_user_id: "creator",
          access_token: "gho_owner",
          refresh_token: "ghr_owner",
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

      it("limits a session caller to rotating their own row", async () => {
        gitProviderFindOneAndUpdateMock.mockResolvedValue(null);
        const { gitProviderController } =
          await import("./git-provider.controller.js");
        const { req, res, status } = makeBodyReqRes({
          provider: "Github",
          old_refresh_token: "owner-refresh",
          access_token: "new-access",
          refresh_token: "new-refresh",
        });

        await gitProviderController.rotateProviderController(req, res, vi.fn());

        const filter = gitProviderFindOneAndUpdateMock.mock.calls[0]?.[0];
        expect(filter).toMatchObject({ user_id: "user-1" });
        expect(status).toHaveBeenCalledWith(404);
      });

      it("lets the internal caller rotate the row holding the token", async () => {
        gitProviderFindOneAndUpdateMock.mockResolvedValue({ _id: "1" });
        const { gitProviderController } =
          await import("./git-provider.controller.js");
        const { req, res } = makeBodyReqRes(
          {
            provider: "Github",
            old_refresh_token: "owner-refresh",
            access_token: "new-access",
            refresh_token: "new-refresh",
          },
          { isInternal: true },
        );

        await gitProviderController.rotateProviderController(req, res, vi.fn());

        const filter = gitProviderFindOneAndUpdateMock.mock.calls[0]?.[0];
        expect(filter).not.toHaveProperty("user_id");
      });
    });
  });
});
