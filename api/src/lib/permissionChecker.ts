import { ROLE_PERMISSIONS, TOrgRole, TPermission } from "@/enums/roles";

// Own-property check only: `role` is caller-supplied, so `in` would match
// inherited members like "toString" and yield a non-array.
const isOrgRole = (role: string): role is TOrgRole =>
  Object.hasOwn(ROLE_PERMISSIONS, role);

export const hasPermission = (
  role: string,
  requiredPermission: string,
): boolean => {
  if (!isOrgRole(role)) return false;
  return ROLE_PERMISSIONS[role].includes(requiredPermission as TPermission);
};
