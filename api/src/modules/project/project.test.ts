import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

const projectAggregateMock = vi.fn();
const projectCountDocumentsMock = vi.fn();
const projectFindOneMock = vi.fn();
const projectFindOneAndDeleteMock = vi.fn();
const projectCreateMock = vi.fn();
const projectUpdateOneMock = vi.fn();
const projectContentDeleteManyMock = vi.fn();
const projectLogDeleteManyMock = vi.fn();
const projectPreviewDeleteManyMock = vi.fn();
const organizationExistsMock = vi.fn();
const runProjectMutationGuardMock = vi.fn();

vi.mock("./project.model", () => ({
  Project: {
    aggregate: (...a: unknown[]) => projectAggregateMock(...a),
    countDocuments: (...a: unknown[]) => projectCountDocumentsMock(...a),
    findOne: (...a: unknown[]) => projectFindOneMock(...a),
    findOneAndDelete: (...a: unknown[]) => projectFindOneAndDeleteMock(...a),
    create: (...a: unknown[]) => projectCreateMock(...a),
    updateOne: (...a: unknown[]) => projectUpdateOneMock(...a),
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
    create: vi.fn(),
  },
}));

vi.mock("../project-preview/project-preview.model", () => ({
  ProjectPreview: {
    deleteMany: (...a: unknown[]) => projectPreviewDeleteManyMock(...a),
    deleteOne: (...a: unknown[]) => projectPreviewDeleteManyMock(...a),
  },
}));

vi.mock("../organization/organization.model", () => ({
  Organization: {
    exists: (...a: unknown[]) => organizationExistsMock(...a),
    findOne: vi.fn(),
  },
}));

vi.mock("@/lib/extensionGuards", () => ({
  runProjectMutationGuard: (...a: unknown[]) =>
    runProjectMutationGuardMock(...a),
  decorateProject: (p: unknown) => p,
}));

function makeReqRes({
  userId,
  role = "user",
  params = {},
  query = {},
  body = {},
}: {
  userId?: string;
  role?: string;
  params?: Record<string, string>;
  query?: Record<string, string>;
  body?: Record<string, unknown>;
}) {
  const req = {
    user: userId ? { user_id: userId, role } : undefined,
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
  projectAggregateMock.mockReset();
  projectCountDocumentsMock.mockReset();
  projectFindOneMock.mockReset();
  projectFindOneAndDeleteMock.mockReset();
  projectCreateMock.mockReset();
  projectUpdateOneMock.mockReset();
  projectContentDeleteManyMock.mockReset();
  projectLogDeleteManyMock.mockReset();
  projectPreviewDeleteManyMock.mockReset();
  organizationExistsMock.mockReset();
  runProjectMutationGuardMock.mockReset();
});

describe("Project Module", () => {
  describe("Services", () => {
    describe("getAllProjectService", () => {
      it("calculates pagination and executes aggregation", async () => {
        const mockResult = [{ project_id: "p1", project_name: "Site 1" }];
        projectAggregateMock.mockResolvedValueOnce(mockResult);
        projectCountDocumentsMock.mockResolvedValueOnce(1);

        const { projectService } = await import("./project.service.js");
        const res = await projectService.getAllProjectService(
          { page: 1, limit: 10 },
          { search: "Site" },
        );

        expect(res.result).toEqual(mockResult);
        expect(res.meta.total).toBe(1);
        expect(projectAggregateMock).toHaveBeenCalled();
        expect(projectCountDocumentsMock).toHaveBeenCalled();
      });
    });

    describe("getSingleProjectService", () => {
      it("retrieves a project by project_id", async () => {
        const mockProject = { project_id: "p1", project_name: "Site 1" };
        projectAggregateMock.mockResolvedValueOnce([mockProject]);

        const { projectService } = await import("./project.service.js");
        const res = await projectService.getSingleProjectService({
          project_id: "p1",
        });

        expect(res).toEqual(mockProject);
      });
    });

    describe("deleteProjectService", () => {
      it("cascades deletion across contents, logs, previews, and project document", async () => {
        projectFindOneMock.mockResolvedValueOnce({
          project_id: "p1",
          org_id: "org-1",
        });
        projectFindOneAndDeleteMock.mockResolvedValueOnce({ project_id: "p1" });

        const { projectService } = await import("./project.service.js");
        const res = await projectService.deleteProjectService({
          project_id: "p1",
        });

        expect(projectContentDeleteManyMock).toHaveBeenCalledWith({
          project_id: "p1",
        });
        expect(projectLogDeleteManyMock).toHaveBeenCalledWith({
          project_id: "p1",
        });
        expect(projectPreviewDeleteManyMock).toHaveBeenCalledWith({
          project_id: "p1",
        });
        expect(projectFindOneAndDeleteMock).toHaveBeenCalledWith({
          project_id: "p1",
        });
        expect(res).toEqual({ project_id: "p1" });
      });
    });
  });

  describe("Controllers", () => {
    describe("getSingleProjectController", () => {
      it("resolves project by params.projectId and returns 200", async () => {
        const mockProject = { project_id: "p1", project_name: "Site 1" };
        projectAggregateMock.mockResolvedValueOnce([mockProject]);

        const { projectController } = await import("./project.controller.js");
        const { req, res, json, status } = makeReqRes({
          params: { projectId: "p1" },
        });

        await projectController.getSingleProjectController(req, res, vi.fn());

        expect(status).toHaveBeenCalledWith(200);
        expect(json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            result: mockProject,
          }),
        );
      });
    });

    describe("getProjectByUserIdController", () => {
      it("blocks strangers from accessing another user's projects with 403", async () => {
        organizationExistsMock.mockResolvedValueOnce(false);

        const { projectController } = await import("./project.controller.js");
        const { req, res } = makeReqRes({
          userId: "stranger",
          role: "user",
          params: { userId: "victim" },
        });

        const next = vi.fn();
        await projectController.getProjectByUserIdController(req, res, next);

        expect(next).toHaveBeenCalledWith(
          expect.objectContaining({
            statusCode: 403,
            message: "You are not authorized to access this resource",
          }),
        );
      });
    });
  });
});
