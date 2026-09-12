import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

const findOneMock = vi.fn();
const findOneAndUpdateMock = vi.fn();

vi.mock("./user-preference.model", () => ({
  UserPreference: {
    findOne: (...a: unknown[]) => findOneMock(...a),
    findOneAndUpdate: (...a: unknown[]) => findOneAndUpdateMock(...a),
  },
}));

function makeReqRes({
  userId,
  params = {},
  body = {},
}: {
  userId?: string;
  params?: Record<string, string>;
  body?: Record<string, unknown>;
}) {
  const req = {
    user: userId ? { user_id: userId } : undefined,
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
});

describe("User Preference Module", () => {
  describe("Services", () => {
    describe("getUserPreferenceService", () => {
      it("retrieves preference by user_id", async () => {
        const mockPref = { user_id: "u1", theme: "dark", language: "en" };
        findOneMock.mockResolvedValueOnce(mockPref);

        const { userPreferenceService } =
          await import("./user-preference.service.js");
        const result =
          await userPreferenceService.getUserPreferenceService("u1");

        expect(result).toEqual(mockPref);
        expect(findOneMock).toHaveBeenCalledWith({ user_id: "u1" });
      });
    });

    describe("updateUserPreferenceService", () => {
      it("upserts preference document", async () => {
        const updated = { user_id: "u1", theme: "light" };
        findOneAndUpdateMock.mockResolvedValueOnce(updated);

        const { userPreferenceService } =
          await import("./user-preference.service.js");
        const result = await userPreferenceService.updateUserPreferenceService(
          "u1",
          { theme: "light" } as never,
        );

        expect(result).toEqual(updated);
        expect(findOneAndUpdateMock).toHaveBeenCalledWith(
          { user_id: "u1" },
          { theme: "light" },
          { returnDocument: "after", upsert: true },
        );
      });
    });

    describe("updateThemePreferenceService", () => {
      it("updates theme with upsert", async () => {
        findOneAndUpdateMock.mockResolvedValueOnce({
          user_id: "u1",
          theme: "system",
        });

        const { userPreferenceService } =
          await import("./user-preference.service.js");
        const result = await userPreferenceService.updateThemePreferenceService(
          "u1",
          "system",
        );

        expect(findOneAndUpdateMock).toHaveBeenCalledWith(
          { user_id: "u1" },
          { theme: "system" },
          { returnDocument: "after", upsert: true },
        );
        expect(result).toEqual({ user_id: "u1", theme: "system" });
      });
    });
  });

  describe("Controllers", () => {
    describe("getUserPreferenceController", () => {
      it("retrieves user preference by req.params.id", async () => {
        const mockPref = { user_id: "u1", theme: "dark" };
        findOneMock.mockResolvedValueOnce(mockPref);

        const { userPreferenceController } =
          await import("./user-preference.controller.js");
        const { req, res, json, status } = makeReqRes({
          params: { id: "u1" },
        });

        await userPreferenceController.getUserPreferenceController(
          req,
          res,
          vi.fn(),
        );

        expect(status).toHaveBeenCalledWith(200);
        expect(json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            result: mockPref,
          }),
        );
      });
    });
  });
});
