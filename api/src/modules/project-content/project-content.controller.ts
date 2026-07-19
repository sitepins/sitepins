import { paginationField } from "@/config/constants";
import catchAsync from "@/lib/catchAsync";
import pick from "@/lib/filterPicker";
import { sendResponse } from "@/lib/sendResponse";
import { Request, Response } from "express";
import { projectContentService } from "./project-content.service";

const contentFilterableFields = ["search", "file"];

// ─── List all content files for a project ────────────────────────────────────
const getProjectContentListController = catchAsync(
  async (req: Request, res: Response) => {
    const project_id = req.params.project_id as string;
    const filters = pick(req.query, contentFilterableFields);
    const paginationOptions = pick(req.query, paginationField);

    const data = await projectContentService.getProjectContentListService(
      project_id,
      filters,
      paginationOptions
    );

    sendResponse(res, {
      success: true,
      statusCode: 200,
      result: data.result,
      meta: data.meta,
      message: "Project content list retrieved successfully",
    });
  }
);

// ─── Get a single file's content ──────────────────────────────────────────────
const getSingleProjectContentController = catchAsync(
  async (req: Request, res: Response) => {
    const project_id = req.params.project_id as string;
    const file = req.query.file as string;

    const data = await projectContentService.getSingleProjectContentService(
      project_id,
      file
    );

    sendResponse(res, {
      success: true,
      statusCode: 200,
      result: data,
      message: "Project content retrieved successfully",
    });
  }
);

// ─── Create or update a file's content ───────────────────────────────────────
const upsertProjectContentController = catchAsync(
  async (req: Request, res: Response) => {
    const project_id = req.params.project_id as string;
    const { user_id, file, content, git_sha } = req.body;

    const data = await projectContentService.upsertProjectContentService({
      project_id,
      user_id,
      file,
      content,
      git_sha,
    });

    sendResponse(res, {
      success: true,
      statusCode: 200,
      result: data,
      message: "Project content saved successfully",
    });
  }
);

// ─── Delete a single file's content ──────────────────────────────────────────
const deleteProjectContentController = catchAsync(
  async (req: Request, res: Response) => {
    const project_id = req.params.project_id as string;
    const file = req.query.file as string;

    await projectContentService.deleteProjectContentService(project_id, file);

    sendResponse(res, {
      success: true,
      statusCode: 200,
      message: "Project content deleted successfully",
    });
  }
);

// ─── Delete ALL content for a project ────────────────────────────────────────
const deleteAllProjectContentController = catchAsync(
  async (req: Request, res: Response) => {
    const project_id = req.params.project_id as string;

    await projectContentService.deleteAllProjectContentService(project_id);

    sendResponse(res, {
      success: true,
      statusCode: 200,
      message: "All project content deleted successfully",
    });
  }
);

export const projectContentController = {
  getProjectContentListController,
  getSingleProjectContentController,
  upsertProjectContentController,
  deleteProjectContentController,
  deleteAllProjectContentController,
};
