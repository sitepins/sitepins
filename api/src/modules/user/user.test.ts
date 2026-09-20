import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const userAggregateMock = vi.fn();
const userFindOneMock = vi.fn();
const userFindOneAndUpdateMock = vi.fn();
const userFindOneAndDeleteMock = vi.fn();
const userDeleteOneMock = vi.fn();
const userPreferenceDeleteManyMock = vi.fn();
const authenticationDeleteManyMock = vi.fn();
const organizationUpdateManyMock = vi.fn();
const runUserDeletionHooksMock = vi.fn();
const deleteProviderByUserIdServiceMock = vi.fn();
const organizationDeleteManyMock = vi.fn();
const projectDeleteManyMock = vi.fn();
const projectContentDeleteManyMock = vi.fn();
const projectLogDeleteManyMock = vi.fn();
const projectPreviewDeleteManyMock = vi.fn();
const sendMailMock = vi.fn();

vi.mock("./user.model", () => ({
  User: {
    aggregate: (...a: unknown[]) => userAggregateMock(...a),
    findOne: (...a: unknown[]) => userFindOneMock(...a),
    findOneAndUpdate: (...a: unknown[]) => userFindOneAndUpdateMock(...a),
    findOneAndDelete: (...a: unknown[]) => userFindOneAndDeleteMock(...a),
    deleteOne: (...a: unknown[]) => userDeleteOneMock(...a),
  },
}));

vi.mock("@/lib/entitlements", () => ({
  runUserDeletionHooks: (...a: unknown[]) => runUserDeletionHooksMock(...a),
  emitUserUpdate: vi.fn(),
}));

vi.mock("../git-provider/git-provider.service", () => ({
  gitProviderService: {
    deleteProviderService: (...a: unknown[]) =>
      deleteProviderByUserIdServiceMock(...a),
  },
}));

vi.mock("../organization/organization.model", () => ({
  Organization: {
    deleteMany: (...a: unknown[]) => organizationDeleteManyMock(...a),
    updateMany: (...a: unknown[]) => organizationUpdateManyMock(...a),
  },
}));

vi.mock("../project/project.model", () => ({
  Project: {
    deleteMany: (...a: unknown[]) => projectDeleteManyMock(...a),
  },
}));

vi.mock("../project-content/project-content.model", () => ({
  ProjectContent: {
    deleteMany: (...a: unknown[]) => projectContentDeleteManyMock(...a),
  },
}));

vi.mock("../project-log/project-log.model", () => ({
  ProjectLog: {
    deleteMany: (...a: unknown[]) => projectLogDeleteManyMock(...a),
  },
}));

vi.mock("../project-preview/project-preview.model", () => ({
  ProjectPreview: {
    deleteMany: (...a: unknown[]) => projectPreviewDeleteManyMock(...a),
  },
}));

vi.mock("../user-preference/user-preference.model", () => ({
  UserPreference: {
    deleteMany: (...a: unknown[]) => userPreferenceDeleteManyMock(...a),
  },
}));

vi.mock("../authentication/authentication.model", () => ({
  Authentication: {
    deleteMany: (...a: unknown[]) => authenticationDeleteManyMock(...a),
  },
}));

vi.mock("@/lib/mailer", () => ({
  sendMail: (...a: unknown[]) => sendMailMock(...a),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const authDeleteUserMock = vi.fn(async (..._a: unknown[]) => ({
  success: true,
}));
const accountsDeleteManyMock = vi.fn();
const sessionsDeleteManyMock = vi.fn();

vi.mock("@/auth", () => ({
  auth: {
    api: {
      setPassword: vi.fn(),
      deleteUser: (...a: unknown[]) => authDeleteUserMock(...a),
    },
  },
  db: {
    collection: (name: string) => ({
      deleteMany: (...a: unknown[]) => {
        if (name === "accounts") return accountsDeleteManyMock(...a);
        if (name === "sessions") return sessionsDeleteManyMock(...a);
        return Promise.resolve();
      },
    }),
  },
}));

const sessionMock = {
  startTransaction: vi.fn(),
  commitTransaction: vi.fn(),
  abortTransaction: vi.fn(),
  endSession: vi.fn(),
};

vi.mock("mongoose", () => {
  const ObjectId = class {
    value: string;
    constructor(value: string) {
      this.value = value;
    }
    toString() {
      return this.value;
    }
    static isValid() {
      return false;
    }
  };
  return {
    default: {
      createConnection: vi.fn(() => ({
        on: vi.fn(),
        model: vi.fn(),
      })),
      startSession: vi.fn(async () => sessionMock),
      connection: {
        db: {
          collection: (name: string) => ({
            deleteMany: (...a: unknown[]) => {
              if (name === "accounts") return accountsDeleteManyMock(...a);
              if (name === "sessions") return sessionsDeleteManyMock(...a);
              return Promise.resolve();
            },
          }),
        },
      },
      Types: { ObjectId },
    },
    Types: { ObjectId },
  };
});

function makeReqRes({
  userId,
  role = "user",
  params = {},
  body = {},
}: {
  userId?: string;
  role?: string;
  params?: Record<string, string>;
  body?: Record<string, unknown>;
}) {
  const req = {
    user: userId ? { user_id: userId, role } : undefined,
    params,
    body,
  } as unknown as Request;

  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const res = { status } as unknown as Response;

  return { req, res, json, status };
}

beforeEach(() => {
  userAggregateMock.mockReset();
  userFindOneMock.mockReset();
  userFindOneAndUpdateMock.mockReset();
  userFindOneAndDeleteMock.mockReset();
  runUserDeletionHooksMock.mockReset();
  accountsDeleteManyMock.mockReset();
  sessionsDeleteManyMock.mockReset();
  deleteProviderByUserIdServiceMock.mockReset();
  organizationDeleteManyMock.mockReset();
  projectDeleteManyMock.mockReset();
  projectContentDeleteManyMock.mockReset();
  projectLogDeleteManyMock.mockReset();
  projectPreviewDeleteManyMock.mockReset();
  userDeleteOneMock.mockReset();
  userPreferenceDeleteManyMock.mockReset();
  authenticationDeleteManyMock.mockReset();
  organizationUpdateManyMock.mockReset();
  sendMailMock.mockReset();
  authDeleteUserMock.mockClear();
  sessionMock.startTransaction.mockClear();
  sessionMock.commitTransaction.mockClear();
  sessionMock.abortTransaction.mockClear();
  sessionMock.endSession.mockClear();
});

describe("User Module", () => {
  describe("Services", () => {
    describe("getSingleUserService", () => {
      it("retrieves a user profile using aggregation projection", async () => {
        const mockUser = {
          user_id: "u1",
          full_name: "Alice",
          email: "alice@example.com",
        };
        userAggregateMock.mockResolvedValueOnce([mockUser]);

        const { userService } = await import("./user.service.js");
        const result = await userService.getSingleUserService("u1");

        expect(result).toEqual(mockUser);
        expect(userAggregateMock).toHaveBeenCalled();
      });
    });

    describe("updateUserCountryService", () => {
      it("does not overwrite if user already has a country set", async () => {
        const existing = { user_id: "u1", country: "US" };
        userFindOneMock.mockResolvedValueOnce(existing);

        const { userService } = await import("./user.service.js");
        const result = await userService.updateUserCountryService("u1", "CA");

        expect(result).toEqual(existing);
        expect(userFindOneAndUpdateMock).not.toHaveBeenCalled();
      });

      it("updates country when user has no country set", async () => {
        userFindOneMock.mockResolvedValueOnce({ user_id: "u1", country: null });
        const updated = { user_id: "u1", country: "CA" };
        userFindOneAndUpdateMock.mockResolvedValueOnce(updated);

        const { userService } = await import("./user.service.js");
        const result = await userService.updateUserCountryService("u1", "CA");

        expect(result).toEqual(updated);
        expect(userFindOneAndUpdateMock).toHaveBeenCalledWith(
          { user_id: "u1" },
          { country: "CA" },
          { returnDocument: "after" },
        );
      });
    });

    describe("deleteUserService", () => {
      it("removes every collection the account owns and archives it in one transaction", async () => {
        const mockUser = { user_id: "u1", email: "alice@example.com" };
        userFindOneMock.mockResolvedValueOnce({
          ...mockUser,
          _id: "507f1f77bcf86cd799439011",
        });

        const { userService } = await import("./user.service.js");
        const req = {
          user: { user_id: "u1", email: "alice@example.com" },
          headers: {},
        } as unknown as Request;
        const result = await userService.deleteUserService("test reason", req);

        expect(userDeleteOneMock).toHaveBeenCalledWith(
          { user_id: "u1" },
          { session: sessionMock },
        );
        expect(accountsDeleteManyMock).toHaveBeenCalled();
        expect(sessionsDeleteManyMock).toHaveBeenCalled();
        expect(organizationDeleteManyMock).toHaveBeenCalledWith(
          { owner: "u1" },
          { session: sessionMock },
        );
        // membership of orgs somebody else owns
        expect(organizationUpdateManyMock).toHaveBeenCalledWith(
          { "members.user_id": "u1" },
          { $pull: { members: { user_id: "u1" } } },
          { session: sessionMock },
        );
        // logs written against the users row's _id go too
        expect(projectLogDeleteManyMock).toHaveBeenCalledWith(
          { user_id: { $in: ["u1", "507f1f77bcf86cd799439011"] } },
          { session: sessionMock },
        );
        expect(userPreferenceDeleteManyMock).toHaveBeenCalledWith(
          { user_id: "u1" },
          { session: sessionMock },
        );
        expect(authenticationDeleteManyMock).toHaveBeenCalledWith(
          { user_id: "u1" },
          { session: sessionMock },
        );
        expect(deleteProviderByUserIdServiceMock).toHaveBeenCalledWith(
          "u1",
          sessionMock,
        );
        expect(runUserDeletionHooksMock).toHaveBeenCalled();
        expect(sessionMock.commitTransaction).toHaveBeenCalled();
        expect(sessionMock.abortTransaction).not.toHaveBeenCalled();
        expect(sendMailMock).toHaveBeenCalledWith({
          to: "alice@example.com",
          kind: "delete_account",
        });
        expect(result.success).toBe(true);
      });

      it("does not touch better-auth's own delete endpoint", async () => {
        // It drops the users row outside any transaction, so a later failure
        // used to leave an account gone from `users`, missing from
        // `deleted_users`, and still owning its organization.
        userFindOneMock.mockResolvedValueOnce({ user_id: "u1" });

        const { userService } = await import("./user.service.js");
        await userService.deleteUserService("test reason", {
          user: { user_id: "u1", email: "alice@example.com" },
          headers: {},
        } as unknown as Request);

        expect(authDeleteUserMock).not.toHaveBeenCalled();
      });

      it("keeps the account when the transaction fails", async () => {
        userFindOneMock.mockResolvedValueOnce({ user_id: "u1" });
        organizationDeleteManyMock.mockRejectedValueOnce(new Error("db down"));

        const { userService } = await import("./user.service.js");

        await expect(
          userService.deleteUserService("test reason", {
            user: { user_id: "u1", email: "alice@example.com" },
            headers: {},
          } as unknown as Request),
        ).rejects.toThrow("db down");

        expect(sessionMock.abortTransaction).toHaveBeenCalled();
        expect(sessionMock.commitTransaction).not.toHaveBeenCalled();
        expect(sendMailMock).not.toHaveBeenCalled();
      });

      it("still reports success when the confirmation email fails", async () => {
        userFindOneMock.mockResolvedValueOnce({ user_id: "u1" });
        sendMailMock.mockRejectedValueOnce(new Error("smtp down"));

        const { userService } = await import("./user.service.js");
        const result = await userService.deleteUserService("test reason", {
          user: { user_id: "u1", email: "alice@example.com" },
          headers: {},
        } as unknown as Request);

        expect(sessionMock.commitTransaction).toHaveBeenCalled();
        expect(result.success).toBe(true);
      });
    });
  });

  describe("Controllers", () => {
    describe("getSingleUserController", () => {
      it("retrieves single user by params.id", async () => {
        const mockUser = { user_id: "u1", full_name: "Alice" };
        userAggregateMock.mockResolvedValueOnce([mockUser]);

        const { userController } = await import("./user.controller.js");
        const { req, res, json, status } = makeReqRes({ params: { id: "u1" } });

        await userController.getSingleUserController(req, res, vi.fn());

        expect(status).toHaveBeenCalledWith(200);
        expect(json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            result: mockUser,
          }),
        );
      });
    });
  });
});
