import { afterEach, describe, expect, it, vi } from "vitest";

async function freshFolders() {
  vi.resetModules();
  return import("./uploadFolders.js");
}

const user = { user_id: "u1", role: "user" };
const admin = { user_id: "a1", role: "admin" };

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("canUploadToFolder", () => {
  it("allows the app's own prefixes and rejects everything else", async () => {
    const { canUploadToFolder } = await freshFolders();

    expect(canUploadToFolder("sitepins/users", user)).toBe(true);
    expect(canUploadToFolder("sitepins/orgs", null)).toBe(true);
    expect(canUploadToFolder("sitepins/user-persona", admin)).toBe(false);
    expect(canUploadToFolder("sitepins", admin)).toBe(false);
  });

  it("adds UPLOAD_FOLDERS entries", async () => {
    vi.stubEnv("UPLOAD_FOLDERS", " myorg/custom , ,other ");
    const { canUploadToFolder } = await freshFolders();

    expect(canUploadToFolder("myorg/custom", user)).toBe(true);
    expect(canUploadToFolder("other", user)).toBe(true);
    expect(canUploadToFolder("", user)).toBe(false);
  });

  it("opens a registered folder to everyone when no roles are given", async () => {
    const { canUploadToFolder, registerUploadFolder } = await freshFolders();
    registerUploadFolder("ext/open");

    expect(canUploadToFolder("ext/open", user)).toBe(true);
  });

  it("limits a registered folder to its roles", async () => {
    const { canUploadToFolder, registerUploadFolder } = await freshFolders();
    registerUploadFolder("ext/private", { roles: ["admin"] });

    expect(canUploadToFolder("ext/private", admin)).toBe(true);
    expect(canUploadToFolder("ext/private", user)).toBe(false);
    expect(canUploadToFolder("ext/private", null)).toBe(false);
  });
});
