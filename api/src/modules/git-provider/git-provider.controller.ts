import catchAsync from "@/lib/catchAsync";
import { sendResponse } from "@/lib/sendResponse";
import { Organization } from "@/modules/organization/organization.model";
import { Project } from "@/modules/project/project.model";
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
    const requesterId = req.user?.user_id;
    const targetParam = req.params.userId;
    const targetId = Array.isArray(targetParam) ? targetParam[0] : targetParam;

    let effectiveUserId = requesterId;
    if (requesterId && targetId && targetId !== requesterId) {
      const myOrgs = await Organization.find({
        $or: [{ owner: requesterId }, { "members.user_id": requesterId }],
      })
        .select("org_id")
        .lean();
      const orgIds = myOrgs.map((o) => o.org_id);

      const sharesProject =
        orgIds.length > 0 &&
        (await Project.exists({
          user_id: targetId,
          org_id: { $in: orgIds },
        }));
      if (sharesProject) effectiveUserId = targetId;
    }

    const provider =
      await gitProviderService.getProviderService(effectiveUserId);
    sendResponse(res, {
      success: true,
      statusCode: 200,
      result: provider,
      message: "provider get successfully",
    });
  },
);

// persist rotated oauth tokens (called by the web app's refresh routes)
const rotateProviderController = catchAsync(
  async (req: Request, res: Response) => {
    const {
      provider,
      old_refresh_token,
      access_token,
      refresh_token,
      access_token_expires_at,
      refresh_token_expires_at,
    } = req.body ?? {};

    if (!provider || !old_refresh_token || !access_token || !refresh_token) {
      sendResponse(res, {
        success: false,
        statusCode: 400,
        result: null,
        message:
          "provider, old_refresh_token, access_token and refresh_token are required",
      });
      return;
    }

    const updated = await gitProviderService.rotateProviderTokensService({
      provider,
      old_refresh_token,
      access_token,
      refresh_token,
      access_token_expires_at,
      refresh_token_expires_at,
    });

    sendResponse(res, {
      success: Boolean(updated),
      statusCode: updated ? 200 : 404,
      result: updated,
      message: updated
        ? "provider tokens rotated"
        : "no provider matches the given refresh token",
    });
  },
);

export const gitProviderController = {
  createProviderController,
  getProviderController,
  rotateProviderController,
};
