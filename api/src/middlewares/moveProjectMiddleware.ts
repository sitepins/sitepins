import { ENUM_PERMISSIONS } from "@/enums/roles";
import ApiError from "@/errors/ApiError";
import { readId, requireOrgPermission } from "@/lib/resourceAuth";
import { Project } from "@/modules/project/project.model";
import { RequestHandler } from "express";

// Moving a project crosses a tenant boundary, so BOTH sides must be checked:
// permission to take the project out of its current org, and permission to
// put it into the destination org. Checking only the destination would let
// anyone pull an arbitrary project into an org they own.
export const moveProjectMiddleware: RequestHandler = async (req, res, next) => {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      throw new ApiError("User authentication required", 401, "");
    }

    const projectId = readId(req.params.projectId);
    const destinationOrgId = readId(req.params.orgId);

    if (!projectId || !destinationOrgId) {
      throw new ApiError(
        "Project ID and organization ID are required",
        400,
        "",
      );
    }

    const project = await Project.findOne({ project_id: projectId })
      .select("org_id")
      .lean();
    if (!project) {
      throw new ApiError("Project not found", 404, "");
    }

    // Source: the check that was missing entirely — without it any user could
    // pull an arbitrary project out of its org.
    await requireOrgPermission(
      userId,
      project.org_id,
      ENUM_PERMISSIONS.MANAGE_PROJECTS,
    );
    // Destination: unchanged from the original route (DELETE_ORG, i.e. owner
    // only). Kept deliberately — relaxing it to MANAGE_PROJECTS would let org
    // admins move projects in, which they could not do before.
    await requireOrgPermission(
      userId,
      destinationOrgId,
      ENUM_PERMISSIONS.DELETE_ORG,
    );

    next();
  } catch (error) {
    next(error);
  }
};
