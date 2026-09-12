import { beforeEach, describe, expect, it, vi } from "vitest";

const findOneMock = vi.fn();
const findOneAndUpdateMock = vi.fn();

vi.mock("@/modules/organization/organization.model", () => ({
  Organization: {
    findOne: (...args: unknown[]) => findOneMock(...args),
    findOneAndUpdate: (...args: unknown[]) => findOneAndUpdateMock(...args),
  },
}));

// Mock any logger or decrypt if needed
vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

beforeEach(() => {
  findOneMock.mockReset();
  findOneAndUpdateMock.mockReset();
});

describe("leaveOrganizationService", () => {
  it("throws 404 if user is not a member of the organization", async () => {
    findOneMock.mockResolvedValue(null);
    const { organizationService } = await import("./organization.service.js");

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
    const { organizationService } = await import("./organization.service.js");

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

    const { organizationService } = await import("./organization.service.js");

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
