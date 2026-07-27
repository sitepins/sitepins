import { ENUM_ROLE_ORG } from "@/enums/roles";
import ApiError from "@/errors/ApiError";
import { Organization } from "@/modules/organization/organization.model";
import { RequestHandler } from "express";

type OrgRole = (typeof ENUM_ROLE_ORG)[keyof typeof ENUM_ROLE_ORG];

export const projectMiddleware = (
  ...allowedRoles: OrgRole[]
): RequestHandler => {
  return async (req, res, next) => {
    try {
      const userId = req.user?.user_id;

      if (!userId) {
        throw new ApiError("User authentication required", 401, "");
      }

      const orgId = req.params.orgId || req.query.orgId || req.body.org_id;

      if (!orgId) {
        throw new ApiError("Organization ID is required", 400, "");
      }

      const organization = await Organization.findOne({
        org_id: orgId,
      });

      if (!organization) {
        throw new ApiError("Organization not found", 404, "");
      }

      // Check owner (has all permissions)
      if (organization.owner === userId) {
        return next();
      }

      const member = organization.members.find((m) => m.user_id === userId);

      if (!member) {
        throw new ApiError(
          "Access denied. Only organization members can view project information.",
          403,
          "",
        );
      }

      if (allowedRoles.length === 0) {
        return next();
      }

      if (allowedRoles.includes(member.role as OrgRole)) {
        return next();
      }

      throw new ApiError(
        "Access denied. You do not have permission to perform this action.",
        403,
        "",
      );
    } catch (error) {
      next(error);
    }
  };
};
