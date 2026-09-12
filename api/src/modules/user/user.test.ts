import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

const userAggregateMock = vi.fn();
const userFindOneMock = vi.fn();
const userFindOneAndUpdateMock = vi.fn();
const userFindOneAndDeleteMock = vi.fn();
const runUserDeletionHooksMock = vi.fn();
const deleteProviderByUserIdServiceMock = vi.fn();
const organizationDeleteManyMock = vi.fn();
const projectDeleteManyMock = vi.fn();
const projectContentDeleteManyMock = vi.fn();
const projectLogDeleteManyMock = vi.fn();
const projectPreviewDeleteManyMock = vi.fn();
const deleteBrevoContactMock = vi.fn();
const sendMailMock = vi.fn();

vi.mock("./user.model", () => ({
  User: {
    aggregate: (...a: unknown[]) => userAggregateMock(...a),
    findOne: (...a: unknown[]) => userFindOneMock(...a),
    findOneAndUpdate: (...a: unknown[]) => userFindOneAndUpdateMock(...a),
    findOneAndDelete: (...a: unknown[]) => userFindOneAndDeleteMock(...a),
  },
}));

vi.mock("@/lib/entitlements", () => ({
  runUserDeletionHooks: (...a: unknown[]) => runUserDeletionHooksMock(...a),
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

vi.mock("@/lib/brevoConfig", () => ({
  deleteBrevoContact: (...a: unknown[]) => deleteBrevoContactMock(...a),
  updateBrevoContact: vi.fn(),
  updateBrevoContactEmail: vi.fn(),
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

vi.mock("@/auth", () => ({
  auth: {
    api: {
      setPassword: vi.fn(),
      deleteUser: vi.fn(async () => ({ success: true })),
    },
  },
}));

vi.mock("mongoose", () => ({
  default: {
    createConnection: vi.fn(() => ({
      on: vi.fn(),
      model: vi.fn(),
    })),
    startSession: vi.fn(async () => ({
      startTransaction: vi.fn(),
      commitTransaction: vi.fn(),
      abortTransaction: vi.fn(),
      endSession: vi.fn(),
    })),
  },
}));

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
  deleteProviderByUserIdServiceMock.mockReset();
  organizationDeleteManyMock.mockReset();
  projectDeleteManyMock.mockReset();
  projectContentDeleteManyMock.mockReset();
  projectLogDeleteManyMock.mockReset();
  projectPreviewDeleteManyMock.mockReset();
  deleteBrevoContactMock.mockReset();
  sendMailMock.mockReset();
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
      it("executes deletion hooks, cleans up related collections, and sends confirmation email", async () => {
        const mockUser = { user_id: "u1", email: "alice@example.com" };
        userFindOneMock.mockResolvedValueOnce(mockUser);
        userFindOneAndDeleteMock.mockResolvedValueOnce(mockUser);

        const { userService } = await import("./user.service.js");
        const req = {
          user: { user_id: "u1", email: "alice@example.com" },
          headers: {},
        } as unknown as Request;
        const result = await userService.deleteUserService("test reason", req);

        expect(runUserDeletionHooksMock).toHaveBeenCalled();
        expect(deleteProviderByUserIdServiceMock).toHaveBeenCalledWith("u1");
        expect(organizationDeleteManyMock).toHaveBeenCalledWith(
          { owner: "u1" },
          expect.anything(),
        );
        expect(sendMailMock).toHaveBeenCalledWith({
          to: "alice@example.com",
          kind: "delete_account",
        });
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
