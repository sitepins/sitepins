import { describe, expect, it } from "vitest";
import {
  ASSIGNABLE_MEMBER_ROLES,
  assertAssignableRole,
  isAssignableMemberRole,
} from "./orgRoles";

describe("orgRoles", () => {
  it("permits the two real member roles", () => {
    expect(ASSIGNABLE_MEMBER_ROLES).toEqual(["admin", "editor"]);
    expect(isAssignableMemberRole("admin")).toBe(true);
    expect(isAssignableMemberRole("editor")).toBe(true);
  });

  it("rejects owner — it grants delete_org and is never a member role", () => {
    expect(isAssignableMemberRole("owner")).toBe(false);
    expect(() => assertAssignableRole("owner")).toThrow(/Invalid member role/);
  });

  it("rejects unknown strings and non-strings (incl. injected objects)", () => {
    for (const bad of ["superadmin", "", "ADMIN", undefined, null, 1, {}, []]) {
      expect(isAssignableMemberRole(bad)).toBe(false);
      expect(() => assertAssignableRole(bad)).toThrow();
    }
  });
});
