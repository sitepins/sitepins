import { ENUM_ROLE_ORG, ROLE_PERMISSIONS } from "@/enums/roles";

export const hasPermission = (
  role: string,
  requiredPermission: string
): boolean => {
  const permissions =
    ROLE_PERMISSIONS[role as keyof typeof ENUM_ROLE_ORG] || [];
  return permissions.includes(requiredPermission as any);
};
