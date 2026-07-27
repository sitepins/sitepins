import catchAsync from "@/lib/catchAsync";
import { sendResponse } from "@/lib/sendResponse";
import { Request, Response } from "express";
import { projectPreviewService } from "./project-preview.service";

const getByProjectIdController = catchAsync(
  async (req: Request, res: Response) => {
    const project_id = req.params.project_id as string;
    const entry = await projectPreviewService.getByProjectIdService(project_id);

    sendResponse(res, {
      success: true,
      statusCode: 200,
      result: entry ?? null,
      message: entry ? "Preview state found" : "No preview state",
    });
  },
);

const upsertController = catchAsync(async (req: Request, res: Response) => {
  const project_id = req.params.project_id as string;

  if (!project_id) {
    return sendResponse(res, {
      success: false,
      statusCode: 400,
      message: "project_id is required",
    });
  }

  const updateData: Record<string, any> = {};
  if (req.body.sandbox_name !== undefined) {
    updateData.sandbox_name = req.body.sandbox_name;
  }
  if (req.body.preview_url !== undefined) {
    updateData.preview_url = req.body.preview_url;
  }
  if (req.body.commit_sha !== undefined) {
    updateData.commit_sha = req.body.commit_sha;
  }

  const entry = await projectPreviewService.upsertService(
    project_id,
    updateData,
  );

  sendResponse(res, {
    success: true,
    statusCode: 200,
    result: entry,
    message: "Preview state updated",
  });
});

const deleteByProjectIdController = catchAsync(
  async (req: Request, res: Response) => {
    const project_id = req.params.project_id as string;
    await projectPreviewService.deleteByProjectIdService(project_id);

    sendResponse(res, {
      success: true,
      statusCode: 200,
      result: null,
      message: "Preview state cleared",
    });
  },
);

export const projectPreviewController = {
  getByProjectIdController,
  upsertController,
  deleteByProjectIdController,
};
