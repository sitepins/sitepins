import { ENUM_ROLE_ORG } from "@/enums/roles";

// allow only editor and admin role for organization members
export const ASSIGNABLE_MEMBER_ROLES: readonly string[] = [
  ENUM_ROLE_ORG.ADMIN,
  ENUM_ROLE_ORG.EDITOR,
];

export function isAssignableMemberRole(role: unknown): boolean {
  return typeof role === "string" && ASSIGNABLE_MEMBER_ROLES.includes(role);
}

export function assertAssignableRole(role: unknown): void {
  if (!isAssignableMemberRole(role)) {
    throw Error("Invalid member role. Allowed roles: admin, editor.");
  }
}
