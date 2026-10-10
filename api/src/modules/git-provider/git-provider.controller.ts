import { ENUM_ROLE_ORG } from "@/enums/roles";
import catchAsync from "@/lib/catchAsync";
import { requireUserId } from "@/lib/requireUser";
import { readId, requireOrgRole } from "@/lib/resourceAuth";
import { sendResponse } from "@/lib/sendResponse";
import { Organization } from "@/modules/organization/organization.model";
import { Project } from "@/modules/project/project.model";
import { Request, Response } from "express";
import { gitProviderService } from "./git-provider.service";
import { TGitProviderType } from "./git-provider.type";

type TProviderRow = Partial<TGitProviderType>;

// The HMAC index is a server-side lookup key; no client ever needs it.
const forOwner = ({ refresh_token_index: _index, ...row }: TProviderRow) => row;

// Collaborators get project-scoped tokens from the app's /api/auth/project-token.
// GitLab still ships the owner's access token until commits move server-side.
const forCollaborator = ({
  refresh_token: _refresh,
  refresh_token_index: _index,
  refresh_token_expires_at: _refreshExpiry,
  ...row
}: TProviderRow) =>
  row.provider === "Github"
    ? { ...row, access_token: "", installation_access_token: "" }
    : row;

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
    const requesterId = requireUserId(req);
    const targetParam = req.params.userId;
    const targetId = Array.isArray(targetParam) ? targetParam[0] : targetParam;

    let effectiveUserId = requesterId;
    if (targetId && targetId !== requesterId) {
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

    const providers =
      await gitProviderService.getProviderService(effectiveUserId);
    const redact = effectiveUserId === requesterId ? forOwner : forCollaborator;
    sendResponse(res, {
      success: true,
      statusCode: 200,
      result: providers.map((row) => (row ? redact(row) : row)),
      message: "provider get successfully",
    });
  },
);

// Internal only: hands the web server what it needs to mint a project token.
const getProjectGrantController = catchAsync(
  async (req: Request, res: Response) => {
    const projectId = readId(req.params.projectId);
    const userId = readId(req.query.user_id);
    if (!projectId || !userId) {
      sendResponse(res, {
        success: false,
        statusCode: 400,
        result: null,
        message: "projectId and user_id are required",
      });
      return;
    }

    const project = await Project.findOne({ project_id: projectId })
      .select("user_id org_id provider repository")
      .lean();
    if (!project) {
      sendResponse(res, {
        success: false,
        statusCode: 404,
        result: null,
        message: "project not found",
      });
      return;
    }

    await requireOrgRole(userId, project.org_id, [
      ENUM_ROLE_ORG.OWNER,
      ENUM_ROLE_ORG.ADMIN,
      ENUM_ROLE_ORG.EDITOR,
    ]);

    const providerName =
      project.provider.toLowerCase() === "gitlab" ? "Gitlab" : "Github";
    const providers = await gitProviderService.getProviderService(
      project.user_id,
    );
    const row = providers.find((p) => p?.provider === providerName);
    if (!row?.access_token) {
      sendResponse(res, {
        success: false,
        statusCode: 404,
        result: null,
        message: "project owner has no connected provider",
      });
      return;
    }

    sendResponse(res, {
      success: true,
      statusCode: 200,
      result: {
        provider: providerName,
        repository: project.repository,
        owner_user_id: project.user_id,
        access_token: row.access_token,
        access_token_expires_at: row.access_token_expires_at
          ? new Date(row.access_token_expires_at).getTime()
          : undefined,
        refresh_token: row.refresh_token || undefined,
      },
      message: "project grant resolved",
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

    // Require plain strings — never let an object through, or a Mongo operator
    // (e.g. {"$gt": ""}) in old_refresh_token/provider would turn the row match
    // into a NoSQL-injection filter and overwrite an arbitrary user's tokens
    // without possessing their refresh token.
    if (
      (provider !== "Github" && provider !== "Gitlab") ||
      typeof old_refresh_token !== "string" ||
      typeof access_token !== "string" ||
      typeof refresh_token !== "string"
    ) {
      sendResponse(res, {
        success: false,
        statusCode: 400,
        result: null,
        message:
          "provider, old_refresh_token, access_token and refresh_token are required",
      });
      return;
    }

    const toEpoch = (v: unknown) =>
      typeof v === "number" && Number.isFinite(v) ? v : undefined;

    const updated = await gitProviderService.rotateProviderTokensService({
      // Session callers may only rotate their own row; the web server rotates
      // a project owner's row on a collaborator's behalf via the internal secret.
      user_id: req.isInternal ? undefined : requireUserId(req),
      provider,
      old_refresh_token,
      access_token,
      refresh_token,
      access_token_expires_at: toEpoch(access_token_expires_at),
      refresh_token_expires_at: toEpoch(refresh_token_expires_at),
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
  getProjectGrantController,
  rotateProviderController,
};
