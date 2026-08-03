import { ENUM_ROLE_ORG, ROLE_PERMISSIONS } from "@/lib/roles";

export const hasPermission = (
  role: string,
  requiredPermission: string,
): boolean => {
  const permissions: readonly string[] =
    ROLE_PERMISSIONS[
      role as (typeof ENUM_ROLE_ORG)[keyof typeof ENUM_ROLE_ORG]
    ] || [];
  return permissions.includes(requiredPermission);
};
