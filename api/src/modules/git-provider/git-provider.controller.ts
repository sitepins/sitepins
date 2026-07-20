import catchAsync from "@/lib/catchAsync";
import { sendResponse } from "@/lib/sendResponse";
import { Request, Response } from "express";
import { gitProviderService } from "./git-provider.service";

// insert provider
const createProviderController = catchAsync(
  async (req: Request, res: Response) => {
    const provider = await gitProviderService.createProviderService({
      ...req.body,
      user_id: req.user?.user_id,
    });

    sendResponse(res, {
      success: true,
      statusCode: 200,
      result: provider,
      message: "provider created successfully",
    });
  },
);

// get all provider
const getProviderController = catchAsync(
  async (req: Request, res: Response) => {
    // Ignore the :userId path param — only the authenticated user's own
    // providers are ever returned (prevents cross-user token disclosure).
    const provider = await gitProviderService.getProviderService(
      req.user?.user_id,
    );
    sendResponse(res, {
      success: true,
      statusCode: 200,
      result: provider,
      message: "provider get successfully",
    });
  },
);

export const gitProviderController = {
  createProviderController,
  getProviderController,
};
