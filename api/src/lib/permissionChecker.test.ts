import { describe, expect, it } from "vitest";
import { ENUM_PERMISSIONS, ENUM_ROLE_ORG } from "@/enums/roles";
import { hasPermission } from "./permissionChecker";

describe("hasPermission", () => {
  it("grants owner every permission", () => {
    Object.values<string>(ENUM_PERMISSIONS).forEach((permission) => {
      expect(hasPermission(ENUM_ROLE_ORG.OWNER, permission)).toBe(true);
    });
  });

  it("grants admin project/member management but not org deletion", () => {
    expect(hasPermission(ENUM_ROLE_ORG.ADMIN, ENUM_PERMISSIONS.MANAGE_PROJECTS)).toBe(true);
    expect(hasPermission(ENUM_ROLE_ORG.ADMIN, ENUM_PERMISSIONS.DELETE_ORG)).toBe(false);
  });

  it("limits editor to view-only permissions", () => {
    expect(hasPermission(ENUM_ROLE_ORG.EDITOR, ENUM_PERMISSIONS.VIEW_PROJECTS)).toBe(true);
    expect(hasPermission(ENUM_ROLE_ORG.EDITOR, ENUM_PERMISSIONS.MANAGE_PROJECTS)).toBe(false);
    expect(hasPermission(ENUM_ROLE_ORG.EDITOR, ENUM_PERMISSIONS.MANAGE_MEMBERS)).toBe(false);
  });

  it("denies everything for an unknown role", () => {
    expect(hasPermission("intruder", ENUM_PERMISSIONS.VIEW_PROJECTS)).toBe(false);
  });
});
