import catchAsync from "@/lib/catchAsync";
import { nanoId } from "@/lib/nanoId";
import { sendResponse } from "@/lib/sendResponse";
import { Request, Response } from "express";
import { projectService } from "./project.service";

// get projects
const getAllProjectController = catchAsync(
  async (req: Request, res: Response) => {
    const paginationOptions = req.query;
    const filterOptions = req.query;

    const project = await projectService.getAllProjectService(
      paginationOptions,
      filterOptions,
    );

    sendResponse(res, {
      success: true,
      statusCode: 200,
      result: project.result,
      meta: project.meta,
      message: "data get successfully",
    });
  },
);

// get projects by org id
const getProjectByOrgIdController = catchAsync(
  async (req: Request, res: Response) => {
    const project = await projectService.getProjectByOrgId({
      org_id: req.params.orgId as string,
    });

    return sendResponse(res, {
      success: true,
      statusCode: 200,
      result: project,
      message: "data get successfully",
    });
  },
);

// get project by user id
const getProjectByUserIdController = catchAsync(
  async (req: Request, res: Response) => {
    const project = await projectService.getProjectByUserIdService({
      user_id: req.params.userId as string,
    });

    sendResponse(res, {
      success: true,
      statusCode: 200,
      result: project,
      message: "project get successfully",
    });
  },
);

// get single project
const getSingleProjectController = catchAsync(
  async (req: Request, res: Response) => {
    const project = await projectService.getSingleProjectService({
      project_id: req.params.projectId as string,
    });

    sendResponse(res, {
      success: true,
      statusCode: 200,
      result: project,
      message: "project get successfully",
    });
  },
);

// insert project
const createProjectController = catchAsync(
  async (req: Request, res: Response) => {
    const provider = await projectService.createProjectService({
      ...req.body,
      project_id: await nanoId(10),
      user_id: req.user?.user_id,
    });

    sendResponse(res, {
      success: true,
      statusCode: 200,
      result: provider,
      message: "project created successfully",
    });
  },
);

// update project
const updateProjectController = catchAsync(
  async (req: Request, res: Response) => {
    const { ...project } = req.body;
    project.project_id = req.params.projectId as string;
    project.org_id = req.query.orgId;
    const updateProject = await projectService.updateProjectService(project);

    sendResponse(res, {
      success: true,
      statusCode: 200,
      result: updateProject,
      message: "project updated successfully",
    });
  },
);

// update project visibility (private/public)
const updateProjectVisibilityController = catchAsync(
  async (req: Request, res: Response) => {
    const project = await projectService.updateProjectVisibilityService({
      project_id: req.params.projectId as string,
      visibility: req.body.visibility,
    });

    sendResponse(res, {
      success: true,
      statusCode: 200,
      result: project,
      message: "project visibility updated successfully",
    });
  },
);

// update project status (active/archived)
const updateProjectStatusController = catchAsync(
  async (req: Request, res: Response) => {
    const project = await projectService.updateProjectStatusService({
      project_id: req.params.projectId as string,
      status: req.body.status,
    });

    sendResponse(res, {
      success: true,
      statusCode: 200,
      result: project,
      message: "project status updated successfully",
    });
  },
);

// update project generator
const updateProjectGeneratorController = catchAsync(
  async (req: Request, res: Response) => {
    const project = await projectService.updateProjectGeneratorService({
      project_id: req.params.projectId as string,
      generator: req.body.generator,
    });

    sendResponse(res, {
      success: true,
      statusCode: 200,
      result: project,
      message: "project generator updated successfully",
    });
  },
);

// update git connection (repository and branch)
const updateGitConnectionController = catchAsync(
  async (req: Request, res: Response) => {
    const project = await projectService.updateGitConnectionService({
      project_id: req.params.projectId as string,
      repository: req.body.repository,
      branch: req.body.branch,
      provider: req.body.provider,
    });

    sendResponse(res, {
      success: true,
      statusCode: 200,
      result: project,
      message: "git connection updated successfully",
    });
  },
);

// move project to another organization
const moveProjectController = catchAsync(
  async (req: Request, res: Response) => {
    const project = await projectService.moveProjectService({
      org_id: req.params.orgId as string,
      project_id: req.params.projectId as string,
    });

    sendResponse(res, {
      success: true,
      statusCode: 200,
      result: project,
      message: "project moved successfully",
    });
  },
);

// delete project
const deleteProjectController = catchAsync(
  async (req: Request, res: Response) => {
    const project = await projectService.deleteProjectService({
      project_id: req.params.projectId as string,
    });

    sendResponse(res, {
      success: true,
      statusCode: 200,
      result: project,
      message: "project deleted successfully",
    });
  },
);

export const projectController = {
  getAllProjectController,
  getProjectByOrgIdController,
  getProjectByUserIdController,
  getSingleProjectController,
  createProjectController,
  updateProjectController,
  updateProjectVisibilityController,
  updateProjectStatusController,
  updateProjectGeneratorController,
  updateGitConnectionController,
  moveProjectController,
  deleteProjectController,
};
