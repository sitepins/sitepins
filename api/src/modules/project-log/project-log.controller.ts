import { paginationField } from "@/config/constants";
import catchAsync from "@/lib/catchAsync";
import pick from "@/lib/filterPicker";
import { sendResponse } from "@/lib/sendResponse";
import { Request, Response } from "express";
import { projectLogService } from "./project-log.service";

// get all project log
const getAllProjectLogController = catchAsync(
  async (req: Request, res: Response) => {
    const paginationOptions = pick(req.query, paginationField);

    const projectLog =
      await projectLogService.getAllProjectLogService(paginationOptions);

    sendResponse(res, {
      success: true,
      statusCode: 200,
      result: projectLog.result,
      meta: projectLog.meta,
      message: "data get successfully",
    });
  },
);

// get single project log
const getSingleProjectLogController = catchAsync(
  async (req: Request, res: Response) => {
    const project_id = req.params.project_id as string;
    const paginationOptions = pick(req.query, paginationField);

    const projectLog = await projectLogService.getSingleProjectLogService(
      project_id,
      paginationOptions,
    );
    sendResponse(res, {
      success: true,
      statusCode: 200,
      result: projectLog,
      message: "data retrieved successfully",
    });
  },
);

// create/update project log
const createProjectLogController = catchAsync(
  async (req: Request, res: Response) => {
    const project_id = req.params.project_id as string;
    const log = req.body;

    // Create a new log document
    const data = await projectLogService.createProjectLogService({
      project_id,
      ...log,
    });

    sendResponse(res, {
      success: true,
      statusCode: 200,
      result: data,
      message: "data updated successfully",
    });
  },
);

// delete project log
const deleteProjectLogController = catchAsync(
  async (req: Request, res: Response) => {
    const project_id = req.params.project_id as string;
    await projectLogService.deleteProjectLogService(project_id as string);

    sendResponse(res, {
      success: true,
      statusCode: 200,
      message: "data deleted successfully",
    });
  },
);

export const projectLogController = {
  getAllProjectLogController,
  getSingleProjectLogController,
  createProjectLogController,
  deleteProjectLogController,
};
