import { ENUM_PERMISSIONS } from "@/enums/roles";
import ApiError from "@/errors/ApiError";
import { hasPermission } from "@/lib/permissionChecker";
import { Organization } from "@/modules/organization/organization.model";
import { NextFunction, Request, Response } from "express";

type Permission = (typeof ENUM_PERMISSIONS)[keyof typeof ENUM_PERMISSIONS];
type OrgIdentifierInput = { org_id?: string; orgId?: string };

const orgMiddleware =
  (requiredPermission: Permission) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Accept multiple possible param/query names because different routes
      // use either `org_id` or `orgId`.
      const params = req.params as OrgIdentifierInput;
      const query = req.query as OrgIdentifierInput;
      const body = req.body as OrgIdentifierInput;

      const orgIdentifier =
        params.org_id ||
        params.orgId ||
        query.org_id ||
        query.orgId ||
        body.org_id ||
        body.orgId;

      if (!orgIdentifier) {
        throw new ApiError("Organization ID is required", 400, "");
      }

      const userId = req.user?.user_id;

      if (!userId) {
        throw new ApiError("User authentication required", 401, "");
      }

      // 1. Check if user is the OWNER
      const org = await Organization.findOne({
        org_id: orgIdentifier,
      });

      if (!org) {
        throw new ApiError("Organization not found", 404, "");
      }

      if (org.owner === userId) {
        // Owner has access to everything
        return next();
      }

      // 2. Check if user is a MEMBER and has permission
      const member = org.members.find((m) => m.user_id === userId);

      if (member) {
        if (hasPermission(member.role, requiredPermission)) {
          return next();
        }
      }

      throw new ApiError(
        "You are not authorized to access this resource",
        403,
        "",
      );
    } catch (error) {
      next(error);
    }
  };

export default orgMiddleware;
