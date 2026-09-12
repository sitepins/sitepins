import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

const findOneMock = vi.fn();
const findOneAndUpdateMock = vi.fn();
const deleteOneMock = vi.fn();
const deleteManyMock = vi.fn();
const aggregateMock = vi.fn();

vi.mock("./project-content.model", () => ({
  ProjectContent: {
    findOne: (...a: unknown[]) => findOneMock(...a),
    findOneAndUpdate: (...a: unknown[]) => findOneAndUpdateMock(...a),
    deleteOne: (...a: unknown[]) => deleteOneMock(...a),
    deleteMany: (...a: unknown[]) => deleteManyMock(...a),
    aggregate: (...a: unknown[]) => aggregateMock(...a),
  },
}));

function makeReqRes({
  userId,
  params = {},
  query = {},
  body = {},
}: {
  userId?: string;
  params?: Record<string, string>;
  query?: Record<string, string>;
  body?: Record<string, unknown>;
}) {
  const req = {
    user: userId ? { user_id: userId } : undefined,
    params,
    query,
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
  deleteOneMock.mockReset();
  deleteManyMock.mockReset();
  aggregateMock.mockReset();
});

describe("Project Content Module", () => {
  describe("Services", () => {
    describe("getSingleProjectContentService", () => {
      it("retrieves content by project_id and file path", async () => {
        const mockRow = {
          project_id: "p1",
          file: "index.md",
          content: "hello",
        };
        findOneMock.mockReturnValue({
          lean: () => Promise.resolve(mockRow),
        });

        const { projectContentService } =
          await import("./project-content.service.js");
        const result =
          await projectContentService.getSingleProjectContentService(
            "p1",
            "index.md",
          );

        expect(result).toEqual(mockRow);
        expect(findOneMock).toHaveBeenCalledWith({
          project_id: "p1",
          file: "index.md",
        });
      });
    });

    describe("upsertProjectContentService", () => {
      it("upserts content with git sha and returns updated document", async () => {
        const data = {
          project_id: "p1",
          user_id: "u1",
          file: "page.md",
          content: "new content",
          git_sha: "abc1234",
        };
        findOneAndUpdateMock.mockResolvedValueOnce(data);

        const { projectContentService } =
          await import("./project-content.service.js");
        const result =
          await projectContentService.upsertProjectContentService(data);

        expect(result).toEqual(data);
        expect(findOneAndUpdateMock).toHaveBeenCalledWith(
          { project_id: "p1", file: "page.md" },
          data,
          expect.objectContaining({ upsert: true }),
        );
      });
    });

    describe("deleteProjectContentService", () => {
      it("deletes a single file row", async () => {
        deleteOneMock.mockResolvedValueOnce({ deletedCount: 1 });

        const { projectContentService } =
          await import("./project-content.service.js");
        await projectContentService.deleteProjectContentService(
          "p1",
          "page.md",
        );

        expect(deleteOneMock).toHaveBeenCalledWith({
          project_id: "p1",
          file: "page.md",
        });
      });
    });
  });

  describe("Controllers", () => {
    describe("getSingleProjectContentController", () => {
      it("retrieves content via query.file and params.project_id", async () => {
        const mockRow = { project_id: "p1", file: "page.md" };
        findOneMock.mockReturnValue({
          lean: () => Promise.resolve(mockRow),
        });

        const { projectContentController } =
          await import("./project-content.controller.js");
        const { req, res, json, status } = makeReqRes({
          params: { project_id: "p1" },
          query: { file: "page.md" },
        });

        await projectContentController.getSingleProjectContentController(
          req,
          res,
          vi.fn(),
        );

        expect(status).toHaveBeenCalledWith(200);
        expect(json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            result: mockRow,
          }),
        );
      });
    });
  });
});
