import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const findOneMock = vi.fn();
const findOneAndUpdateMock = vi.fn();
const aggregateMock = vi.fn();
const userFindOneMock = vi.fn();
const sendMailMock = vi.fn();

vi.mock("@/modules/organization/organization.model", () => ({
  Organization: {
    findOne: (...args: unknown[]) => findOneMock(...args),
    findOneAndUpdate: (...args: unknown[]) => findOneAndUpdateMock(...args),
    aggregate: (...args: unknown[]) => aggregateMock(...args),
  },
}));

vi.mock("@/modules/user/user.model", () => ({
  User: {
    findOne: (...args: unknown[]) => userFindOneMock(...args),
  },
}));

vi.mock("@/lib/mailer", () => ({
  sendMail: (...args: unknown[]) => sendMailMock(...args),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

function makeReqRes({
  userId,
  role,
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
  findOneMock.mockReset();
  findOneAndUpdateMock.mockReset();
  aggregateMock.mockReset();
  userFindOneMock.mockReset();
  sendMailMock.mockReset();
});

describe("Organization Module", () => {
  describe("Services", () => {
    describe("leaveOrganizationService", () => {
      it("throws 404 if user is not a member of the organization", async () => {
        findOneMock.mockResolvedValue(null);
        const { organizationService } =
          await import("./organization.service.js");

        await expect(
          organizationService.leaveOrganizationService({
            org_id: "org-123",
            loggedInUserId: "user-stranger",
          }),
        ).rejects.toThrow("User is not a member of this organization.");
      });

      it("throws 400 if user is the owner of the organization", async () => {
        findOneMock.mockResolvedValue({
          org_id: "org-123",
          owner: "user-owner",
          members: [{ user_id: "user-owner", role: "owner" }],
        });
        const { organizationService } =
          await import("./organization.service.js");

        await expect(
          organizationService.leaveOrganizationService({
            org_id: "org-123",
            loggedInUserId: "user-owner",
          }),
        ).rejects.toThrow("Organization owner cannot leave the organization.");
      });

      it("successfully removes the member when valid non-owner member leaves", async () => {
        findOneMock.mockResolvedValue({
          org_id: "org-123",
          owner: "user-owner",
          members: [
            { user_id: "user-owner", role: "owner" },
            { user_id: "user-member", role: "editor" },
          ],
        });
        findOneAndUpdateMock.mockResolvedValue({});

        const { organizationService } =
          await import("./organization.service.js");

        const result = await organizationService.leaveOrganizationService({
          org_id: "org-123",
          loggedInUserId: "user-member",
        });

        expect(result).toEqual({
          user_id: "user-member",
          org_id: "org-123",
          left: true,
        });

        expect(findOneAndUpdateMock).toHaveBeenCalledWith(
          {
            org_id: "org-123",
            "members.user_id": "user-member",
          },
          {
            $pull: {
              members: {
                user_id: "user-member",
              },
            },
          },
        );
      });
    });

    describe("removeTeamMemberService", () => {
      it("throws if the logged-in user is not an admin", async () => {
        findOneMock.mockResolvedValueOnce(null);
        const { organizationService } =
          await import("./organization.service.js");

        await expect(
          organizationService.removeTeamMemberService({
            org_id: "org-123",
            userId: "target-user",
            loggedInUserId: "non-admin",
          }),
        ).rejects.toThrow("Only admins can remove team members.");
      });

      it("throws if the logged-in user attempts to remove themselves", async () => {
        findOneMock.mockResolvedValueOnce({
          org_id: "org-123",
          members: [{ user_id: "admin-1", role: "admin" }],
        });
        const { organizationService } =
          await import("./organization.service.js");

        await expect(
          organizationService.removeTeamMemberService({
            org_id: "org-123",
            userId: "admin-1",
            loggedInUserId: "admin-1",
          }),
        ).rejects.toThrow("You cannot remove yourself.");
      });

      it("throws if the target user is the owner", async () => {
        findOneMock
          .mockResolvedValueOnce({
            org_id: "org-123",
            org_name: "Test Org",
            members: [{ user_id: "admin-1", role: "admin" }],
          })
          .mockResolvedValueOnce({
            org_id: "org-123",
            owner: "owner-1",
            members: [{ user_id: "owner-1", role: "owner" }],
          });

        const { organizationService } =
          await import("./organization.service.js");

        await expect(
          organizationService.removeTeamMemberService({
            org_id: "org-123",
            userId: "owner-1",
            loggedInUserId: "admin-1",
          }),
        ).rejects.toThrow("You cannot remove the owner.");
      });

      it("successfully removes member and sends notification email", async () => {
        findOneMock
          .mockResolvedValueOnce({
            org_id: "org-123",
            org_name: "Test Org",
            members: [{ user_id: "admin-1", role: "admin" }],
          })
          .mockResolvedValueOnce({
            org_id: "org-123",
            owner: "owner-1",
            members: [{ user_id: "member-2", role: "editor" }],
          });
        findOneAndUpdateMock.mockResolvedValueOnce({});
        userFindOneMock.mockResolvedValueOnce({
          user_id: "member-2",
          email: "member2@example.com",
        });

        const { organizationService } =
          await import("./organization.service.js");

        const result = await organizationService.removeTeamMemberService({
          org_id: "org-123",
          userId: "member-2",
          loggedInUserId: "admin-1",
        });

        expect(result).toEqual({
          user_id: "member-2",
          delete: true,
        });

        expect(findOneAndUpdateMock).toHaveBeenCalledWith(
          {
            org_id: "org-123",
            "members.user_id": "member-2",
          },
          {
            $pull: {
              members: {
                user_id: "member-2",
              },
            },
          },
        );

        expect(sendMailMock).toHaveBeenCalledWith({
          to: "member2@example.com",
          kind: "org_member_removed",
          params: {
            org_name: "Test Org",
          },
        });
      });
    });

    describe("getOrganizationService", () => {
      it("filters by org_id and user membership when userId is provided", async () => {
        aggregateMock.mockResolvedValueOnce([
          { org_id: "org-123", org_name: "Test Org" },
        ]);

        const { organizationService } =
          await import("./organization.service.js");

        const result = await organizationService.getOrganizationService({
          org_id: "org-123",
          userId: "user-1",
        });

        expect(result).toEqual(
          expect.objectContaining({ org_id: "org-123", org_name: "Test Org" }),
        );
        expect(aggregateMock).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({
              $match: {
                $and: [
                  { org_id: "org-123" },
                  { members: { $elemMatch: { user_id: "user-1" } } },
                ],
              },
            }),
          ]),
        );
      });

      it("filters only by org_id when userId is not provided", async () => {
        aggregateMock.mockResolvedValueOnce([
          { org_id: "org-123", org_name: "Test Org" },
        ]);

        const { organizationService } =
          await import("./organization.service.js");

        const result = await organizationService.getOrganizationService({
          org_id: "org-123",
        });

        expect(result).toEqual(
          expect.objectContaining({ org_id: "org-123", org_name: "Test Org" }),
        );
        expect(aggregateMock).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({
              $match: { org_id: "org-123" },
            }),
          ]),
        );
      });
    });
  });

  describe("Controllers", () => {
    describe("leaveOrganizationController", () => {
      it("binds loggedInUserId exclusively from authenticated session", async () => {
        findOneMock.mockResolvedValue({
          org_id: "org-123",
          owner: "owner-1",
          members: [
            { user_id: "owner-1", role: "owner" },
            { user_id: "session-user", role: "editor" },
          ],
        });
        findOneAndUpdateMock.mockResolvedValue({});

        const { organizationController } =
          await import("./organization.controller.js");

        // Attempting to pass a spoofed user_id in body
        const { req, res, json, status } = makeReqRes({
          userId: "session-user",
          params: { org_id: "org-123" },
          body: { member_id: "spoofed-user", user_id: "spoofed-user" },
        });

        await organizationController.leaveOrganizationController(
          req,
          res,
          vi.fn(),
        );

        expect(status).toHaveBeenCalledWith(200);
        expect(json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            message: "Left organization successfully",
            result: {
              user_id: "session-user",
              org_id: "org-123",
              left: true,
            },
          }),
        );
      });
    });
  });
});
