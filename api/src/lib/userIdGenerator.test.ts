import { beforeEach, describe, expect, it, vi } from "vitest";

const existsMock = vi.fn();
const nanoIdMock = vi.fn();

vi.mock("@/modules/user/user.model", () => ({
  User: { exists: (...args: unknown[]) => existsMock(...args) },
}));

vi.mock("./nanoId", () => ({
  nanoId: (...args: unknown[]) => nanoIdMock(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  existsMock.mockResolvedValue(null);
});

describe("createUserId", () => {
  it("mints a 16 character nanoid", async () => {
    nanoIdMock.mockResolvedValue("Kp3nQ7zXvB123456");
    const { createUserId, USER_ID_LENGTH } =
      await import("./userIdGenerator.js");

    expect(await createUserId()).toBe("Kp3nQ7zXvB123456");
    expect(nanoIdMock).toHaveBeenCalledWith(16);
    expect(USER_ID_LENGTH).toBe(16);
  });

  it("carries no trace of any email", async () => {
    nanoIdMock.mockResolvedValue("Kp3nQ7zXvB");
    const { createUserId } = await import("./userIdGenerator.js");

    const id = await createUserId();
    expect(id).not.toContain("@");
    expect(id.startsWith("@user_")).toBe(false);
  });

  it("retries when the candidate is already taken", async () => {
    nanoIdMock
      .mockResolvedValueOnce("Taken12345")
      .mockResolvedValueOnce("Fresh67890");
    existsMock.mockResolvedValueOnce({ _id: "x" }).mockResolvedValueOnce(null);

    const { createUserId } = await import("./userIdGenerator.js");

    expect(await createUserId()).toBe("Fresh67890");
    expect(nanoIdMock).toHaveBeenCalledTimes(2);
  });

  it("throws rather than returning a duplicate id", async () => {
    nanoIdMock.mockResolvedValue("Taken12345");
    existsMock.mockResolvedValue({ _id: "x" });

    const { createUserId } = await import("./userIdGenerator.js");

    await expect(createUserId()).rejects.toThrow("unique user_id");
  });
});
