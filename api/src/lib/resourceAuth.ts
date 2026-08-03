import { ENUM_ROLE_ORG, TOrgRole, TPermission } from "@/enums/roles";
import ApiError from "@/errors/ApiError";
import { hasPermission } from "@/lib/permissionChecker";
import { Organization } from "@/modules/organization/organization.model";
import { Project } from "@/modules/project/project.model";
import type { Request } from "express";

// Only plain strings are accepted as identifiers. Express parses `?id[$ne]=`
// into an object, which would turn a `findOne` filter into a NoSQL-injection
// operator.
export const readId = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

// The org that owns a request's target resource. Resolution order matters:
// a project id in the PATH binds to that project's OWN org, so a caller can
// never authorize against an org they happen to belong to while acting on a
// project in a different one. Only routes with no existing resource (project
// creation) may name their org in the body.
export const resolveTargetOrgId = async (
  req: Request,
): Promise<string | undefined> => {
  const projectId =
    readId(req.params.projectId) ?? readId(req.params.project_id);

  if (projectId) {
    const project = await Project.findOne({ project_id: projectId })
      .select("org_id")
      .lean();
    if (!project) {
      throw new ApiError("Project not found", 404, "");
    }
    return project.org_id;
  }

  return (
    readId(req.params.orgId) ??
    readId(req.params.org_id) ??
    readId((req.body as { org_id?: unknown } | undefined)?.org_id)
  );
};

type OrgAccess = { orgId: string; role: TOrgRole };

// Resolves the caller's role in `orgId`, or throws 403/404.
export const requireOrgAccess = async (
  userId: string,
  orgId: string,
): Promise<OrgAccess> => {
  const org = await Organization.findOne({ org_id: orgId })
    .select("owner members.user_id members.role")
    .lean();

  if (!org) {
    throw new ApiError("Organization not found", 404, "");
  }

  if (org.owner === userId) {
    return { orgId, role: ENUM_ROLE_ORG.OWNER };
  }

  const member = (org.members ?? []).find((m) => m.user_id === userId);
  if (!member) {
    throw new ApiError(
      "You are not authorized to access this resource",
      403,
      "",
    );
  }

  return { orgId, role: member.role as TOrgRole };
};

export const requireOrgRole = async (
  userId: string,
  orgId: string,
  allowedRoles: readonly TOrgRole[],
): Promise<OrgAccess> => {
  const access = await requireOrgAccess(userId, orgId);
  if (allowedRoles.length > 0 && !allowedRoles.includes(access.role)) {
    throw new ApiError(
      "Access denied. You do not have permission to perform this action.",
      403,
      "",
    );
  }
  return access;
};

export const requireOrgPermission = async (
  userId: string,
  orgId: string,
  permission: TPermission,
): Promise<OrgAccess> => {
  const access = await requireOrgAccess(userId, orgId);
  if (!hasPermission(access.role, permission)) {
    throw new ApiError(
      "You are not authorized to access this resource",
      403,
      "",
    );
  }
  return access;
};
