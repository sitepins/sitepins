import { beforeEach, describe, expect, it, vi } from "vitest";

const updateManyMock = vi.fn();

vi.mock("@/modules/organization/organization.model", () => ({
  Organization: {
    updateMany: (...args: unknown[]) => updateManyMock(...args),
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
  updateManyMock.mockResolvedValue({ modifiedCount: 0 });
});

describe("pendingInvites", () => {
  describe("emailMatcher", () => {
    it("matches case-insensitively and ignores surrounding whitespace", async () => {
      const { emailMatcher } = await import("./pendingInvites.js");
      expect(emailMatcher("  New@Example.com ").test("new@example.com")).toBe(
        true,
      );
      expect(emailMatcher("new@example.com").test("NEW@EXAMPLE.COM")).toBe(
        true,
      );
    });

    it("anchors, so a substring cannot match another address", async () => {
      const { emailMatcher } = await import("./pendingInvites.js");
      expect(emailMatcher("a@b.com").test("xa@b.com")).toBe(false);
      expect(emailMatcher("a@b.com").test("a@b.community")).toBe(false);
    });

    it("escapes regex metacharacters in the address", async () => {
      const { emailMatcher } = await import("./pendingInvites.js");
      expect(emailMatcher("a.b+c@x.com").test("aXb+c@x.com")).toBe(false);
      expect(emailMatcher("a.b+c@x.com").test("a.b+c@x.com")).toBe(true);
    });
  });

  describe("reconcilePendingInvites", () => {
    it("claims only pending rows for the new account's address", async () => {
      updateManyMock.mockResolvedValue({ modifiedCount: 2 });
      const { reconcilePendingInvites } = await import("./pendingInvites.js");

      const count = await reconcilePendingInvites(
        " Invitee@Example.com ",
        "Kp3nQ7zXvB",
      );

      expect(count).toBe(2);
      const [filter, update, options] = updateManyMock.mock.calls[0];
      expect(filter.members.$elemMatch.status).toBe("pending");
      expect(filter.members.$elemMatch.email.source).toBe(
        "^invitee@example\\.com$",
      );
      expect(update.$set).toEqual({
        "members.$[invite].user_id": "Kp3nQ7zXvB",
        "members.$[invite].status": "active",
      });
      expect(options.arrayFilters[0]["invite.status"]).toBe("pending");
    });

    it("never touches an active membership row", async () => {
      const { reconcilePendingInvites } = await import("./pendingInvites.js");
      await reconcilePendingInvites("invitee@example.com", "Kp3nQ7zXvB");

      const [filter, , options] = updateManyMock.mock.calls[0];
      expect(filter.members.$elemMatch).toHaveProperty("status", "pending");
      expect(options.arrayFilters[0]).toHaveProperty(
        "invite.status",
        "pending",
      );
    });

    it("is a no-op without both an email and a user id", async () => {
      const { reconcilePendingInvites } = await import("./pendingInvites.js");
      expect(await reconcilePendingInvites("", "Kp3nQ7zXvB")).toBe(0);
      expect(await reconcilePendingInvites("a@b.com", "")).toBe(0);
      expect(updateManyMock).not.toHaveBeenCalled();
    });
  });
});
