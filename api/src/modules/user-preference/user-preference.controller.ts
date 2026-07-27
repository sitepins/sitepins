import catchAsync from "@/lib/catchAsync";
import { sendResponse } from "@/lib/sendResponse";
import { Request, Response } from "express";
import { userPreferenceService } from "./user-preference.service";

// get user preference
const getUserPreferenceController = catchAsync(
  async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const userPreference =
      await userPreferenceService.getUserPreferenceService(id);

    sendResponse(res, {
      success: true,
      statusCode: 200,
      result: userPreference,
      message: "data get successfully",
    });
  },
);

// update/create user preference
const updateUserPreferenceController = catchAsync(
  async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const preference = req.body;

    await userPreferenceService.updateUserPreferenceService(id, preference);
    sendResponse(res, {
      success: true,
      statusCode: 200,
      message: "data updated successfully",
    });
  },
);

// update theme preference
const updateThemePreferenceController = catchAsync(
  async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const theme = req.body.theme as string;

    await userPreferenceService.updateThemePreferenceService(id, theme);
    sendResponse(res, {
      success: true,
      statusCode: 200,
      message: "data updated successfully",
    });
  },
);

// update language preference
const updateLanguagePreferenceController = catchAsync(
  async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const language = req.body.language as string;

    await userPreferenceService.updateLanguagePreferenceService(id, language);
    sendResponse(res, {
      success: true,
      statusCode: 200,
      message: "data updated successfully",
    });
  },
);

// update timezone preference
const updateTimezonePreferenceController = catchAsync(
  async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const timezone = req.body.timezone as string;

    await userPreferenceService.updateTimezonePreferenceService(id, timezone);
    sendResponse(res, {
      success: true,
      statusCode: 200,
      message: "data updated successfully",
    });
  },
);

// update co-author preference
const updateCoAuthorPreferenceController = catchAsync(
  async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const impersonate = req.body.impersonate as boolean;

    await userPreferenceService.updateCoAuthorPreferenceService(
      id,
      impersonate,
    );
    sendResponse(res, {
      success: true,
      statusCode: 200,
      message: "data updated successfully",
    });
  },
);

export const userPreferenceController = {
  getUserPreferenceController,
  updateUserPreferenceController,
  updateThemePreferenceController,
  updateLanguagePreferenceController,
  updateTimezonePreferenceController,
  updateCoAuthorPreferenceController,
};
