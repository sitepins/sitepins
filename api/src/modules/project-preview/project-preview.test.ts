import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

const previewFindOneMock = vi.fn();
const previewFindOneAndUpdateMock = vi.fn();
const previewDeleteOneMock = vi.fn();

vi.mock("./project-preview.model", () => ({
  ProjectPreview: {
    findOne: (...a: unknown[]) => previewFindOneMock(...a),
    findOneAndUpdate: (...a: unknown[]) => previewFindOneAndUpdateMock(...a),
    deleteOne: (...a: unknown[]) => previewDeleteOneMock(...a),
  },
}));

function makeReqRes({
  params = {},
  body = {},
}: {
  params?: Record<string, string>;
  body?: Record<string, unknown>;
} = {}) {
  const req = {
    params,
    body,
  } as unknown as Request;

  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const res = { status } as unknown as Response;

  return { req, res, json, status };
}

beforeEach(() => {
  previewFindOneMock.mockReset();
  previewFindOneAndUpdateMock.mockReset();
  previewDeleteOneMock.mockReset();
});

describe("Project Preview Module", () => {
  describe("Services", () => {
    describe("getByProjectIdService", () => {
      it("retrieves a preview entry by project_id", async () => {
        const mockPreview = {
          project_id: "p1",
          preview_url: "https://preview.sitepins.com",
        };
        previewFindOneMock.mockResolvedValueOnce(mockPreview);

        const { projectPreviewService } =
          await import("./project-preview.service.js");
        const res = await projectPreviewService.getByProjectIdService("p1");

        expect(previewFindOneMock).toHaveBeenCalledWith({ project_id: "p1" });
        expect(res).toEqual(mockPreview);
      });
    });

    describe("upsertService", () => {
      it("upserts preview data with timestamp", async () => {
        const mockUpdated = {
          project_id: "p1",
          preview_url: "https://preview.sitepins.com",
          commit_sha: "abc1234",
        };
        previewFindOneAndUpdateMock.mockResolvedValueOnce(mockUpdated);

        const { projectPreviewService } =
          await import("./project-preview.service.js");
        const res = await projectPreviewService.upsertService("p1", {
          preview_url: "https://preview.sitepins.com",
          commit_sha: "abc1234",
        });

        expect(previewFindOneAndUpdateMock).toHaveBeenCalledWith(
          { project_id: "p1" },
          expect.objectContaining({
            $set: expect.objectContaining({
              project_id: "p1",
              preview_url: "https://preview.sitepins.com",
              commit_sha: "abc1234",
            }),
          }),
          { upsert: true, returnDocument: "after" },
        );
        expect(res).toEqual(mockUpdated);
      });
    });

    describe("deleteByProjectIdService", () => {
      it("deletes a preview record by project_id", async () => {
        previewDeleteOneMock.mockResolvedValueOnce({ deletedCount: 1 });

        const { projectPreviewService } =
          await import("./project-preview.service.js");
        const res = await projectPreviewService.deleteByProjectIdService("p1");

        expect(previewDeleteOneMock).toHaveBeenCalledWith({ project_id: "p1" });
        expect(res).toEqual({ deletedCount: 1 });
      });
    });
  });

  describe("Controllers", () => {
    describe("getByProjectIdController", () => {
      it("returns 200 with preview data when found", async () => {
        const mockPreview = {
          project_id: "p1",
          preview_url: "https://preview.sitepins.com",
        };
        previewFindOneMock.mockResolvedValueOnce(mockPreview);

        const { projectPreviewController } =
          await import("./project-preview.controller.js");
        const { req, res, json, status } = makeReqRes({
          params: { project_id: "p1" },
        });

        await projectPreviewController.getByProjectIdController(
          req,
          res,
          vi.fn(),
        );

        expect(status).toHaveBeenCalledWith(200);
        expect(json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            result: mockPreview,
            message: "Preview state found",
          }),
        );
      });
    });

    describe("upsertController", () => {
      it("returns 400 when project_id is missing", async () => {
        const { projectPreviewController } =
          await import("./project-preview.controller.js");
        const { req, res, json, status } = makeReqRes({
          params: { project_id: "" },
        });

        await projectPreviewController.upsertController(req, res, vi.fn());

        expect(status).toHaveBeenCalledWith(400);
        expect(json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: false,
            message: "project_id is required",
          }),
        );
      });

      it("upserts preview state and returns 200", async () => {
        const mockEntry = { project_id: "p1", sandbox_name: "box-1" };
        previewFindOneAndUpdateMock.mockResolvedValueOnce(mockEntry);

        const { projectPreviewController } =
          await import("./project-preview.controller.js");
        const { req, res, json, status } = makeReqRes({
          params: { project_id: "p1" },
          body: { sandbox_name: "box-1" },
        });

        await projectPreviewController.upsertController(req, res, vi.fn());

        expect(status).toHaveBeenCalledWith(200);
        expect(json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            result: mockEntry,
            message: "Preview state updated",
          }),
        );
      });
    });

    describe("deleteByProjectIdController", () => {
      it("clears preview state and returns 200", async () => {
        previewDeleteOneMock.mockResolvedValueOnce({ deletedCount: 1 });

        const { projectPreviewController } =
          await import("./project-preview.controller.js");
        const { req, res, json, status } = makeReqRes({
          params: { project_id: "p1" },
        });

        await projectPreviewController.deleteByProjectIdController(
          req,
          res,
          vi.fn(),
        );

        expect(status).toHaveBeenCalledWith(200);
        expect(json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            result: null,
            message: "Preview state cleared",
          }),
        );
      });
    });
  });
});
