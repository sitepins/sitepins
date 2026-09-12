import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

const aggregateMock = vi.fn();
const createMock = vi.fn();
const deleteManyMock = vi.fn();

vi.mock("./project-log.model", () => ({
  ProjectLog: {
    aggregate: (...a: unknown[]) => aggregateMock(...a),
    create: (...a: unknown[]) => createMock(...a),
    deleteMany: (...a: unknown[]) => deleteManyMock(...a),
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
  aggregateMock.mockReset();
  createMock.mockReset();
  deleteManyMock.mockReset();
});

describe("Project Log Module", () => {
  describe("Services", () => {
    describe("createProjectLogService", () => {
      it("creates a new log entry", async () => {
        const logData = {
          project_id: "p1",
          user_id: "u1",
          action: "update",
          file: "index.md",
          file_type: "markdown",
        };
        createMock.mockResolvedValueOnce({ _id: "l1", ...logData });

        const { projectLogService } = await import("./project-log.service.js");
        const result = await projectLogService.createProjectLogService(
          logData as never,
        );

        expect(result).toEqual(expect.objectContaining(logData));
        expect(createMock).toHaveBeenCalledWith(logData);
      });
    });

    describe("deleteProjectLogService", () => {
      it("deletes all logs for a given project_id", async () => {
        deleteManyMock.mockResolvedValueOnce({ deletedCount: 5 });

        const { projectLogService } = await import("./project-log.service.js");
        await projectLogService.deleteProjectLogService("p1");

        expect(deleteManyMock).toHaveBeenCalledWith({ project_id: "p1" });
      });
    });

    describe("getSingleProjectLogService", () => {
      it("aggregates deduplicated logs for a project", async () => {
        const mockLogs = [{ _id: "l1", action: "update", file: "page.md" }];
        aggregateMock
          .mockResolvedValueOnce(mockLogs)
          .mockResolvedValueOnce([{ total: 1 }]);

        const { projectLogService } = await import("./project-log.service.js");
        const result = await projectLogService.getSingleProjectLogService("p1");

        expect(result.project_id).toBe("p1");
        expect(result.logs).toEqual(mockLogs);
        expect(result.meta.total).toBe(1);
      });
    });
  });

  describe("Controllers", () => {
    describe("createProjectLogController", () => {
      it("extracts project_id from params and body payload to create a log", async () => {
        const logData = { action: "create", file: "about.md" };
        createMock.mockResolvedValueOnce({
          _id: "l2",
          project_id: "p1",
          ...logData,
        });

        const { projectLogController } =
          await import("./project-log.controller.js");
        const { req, res, json, status } = makeReqRes({
          params: { project_id: "p1" },
          body: logData,
        });

        await projectLogController.createProjectLogController(
          req,
          res,
          vi.fn(),
        );

        expect(status).toHaveBeenCalledWith(200);
        expect(json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            result: expect.objectContaining({
              project_id: "p1",
              action: "create",
            }),
          }),
        );
      });
    });
  });
});
