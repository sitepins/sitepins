import brand from "@/config/brand";
import type { TAuthUser } from "@/types";

/** True for an S3 key the app itself uploaded (avatars, logos). */
export const isUploadKey = (key: string) =>
  key.startsWith(`${brand.upload_prefix}/`);

// Bucket keys carry no ownership metadata, so an unconstrained `folder` would
// let a caller write anywhere in the bucket. Each prefix the app uploads to is
// listed here; UPLOAD_FOLDERS and registerUploadFolder extend it.
const DEFAULT_UPLOAD_FOLDERS = ["users", "orgs", "sites"].map(
  (kind) => `${brand.upload_prefix}/${kind}`,
);

const ENV_UPLOAD_FOLDERS = (process.env.UPLOAD_FOLDERS ?? "")
  .split(",")
  .map((f) => f.trim())
  .filter(Boolean);

type TUploadFolderOptions = {
  /** Restricts uploads to callers with one of these roles. */
  roles?: string[];
};

const openFolders = new Set([...DEFAULT_UPLOAD_FOLDERS, ...ENV_UPLOAD_FOLDERS]);
const registeredFolders = new Map<string, TUploadFolderOptions>();

export const registerUploadFolder = (
  folder: string,
  options: TUploadFolderOptions = {},
) => {
  registeredFolders.set(folder, options);
};

export const canUploadToFolder = (
  folder: string,
  user: TAuthUser | null | undefined,
): boolean => {
  if (openFolders.has(folder)) return true;
  const options = registeredFolders.get(folder);
  if (!options) return false;
  if (!options.roles) return true;
  return !!user?.role && options.roles.includes(user.role);
};
