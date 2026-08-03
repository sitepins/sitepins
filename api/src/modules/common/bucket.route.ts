import config from "@/config/variables";
import { ENUM_ROLE } from "@/enums/roles";
import { checkFileExists, deleteFile, s3Client } from "@/lib/s3-utils";
import { sendResponse } from "@/lib/sendResponse";
import { authMiddleware } from "@/middlewares/authMiddleware";
import { uploadLimiter } from "@/middlewares/rateLimiters";
import { randomUUID } from "crypto";
import express from "express";
import multer from "multer";
import multerS3 from "multer-s3";

const bucketRouter: express.Router = express.Router();

// multer-s3 hands its callbacks the raw IncomingMessage, not an
// express.Request, and the multipart fields arrive as untyped strings.
type UploadBody = { permission?: string; folder?: string };
const uploadBody = (req: unknown): UploadBody =>
  ((req as { body?: UploadBody }).body ?? {}) as UploadBody;

// Bucket keys carry no ownership metadata, so an unconstrained `folder` let a
// caller write anywhere in the bucket — including over another user's avatar.
// Every prefix the apps actually upload to (app avatar uploads + the admin
// dashboard's persona pictures). Adding a new upload surface means adding its
// prefix here; UPLOAD_FOLDERS can extend the list without a code change.
const DEFAULT_ALLOWED_FOLDERS = [
  "sitepins/users",
  "sitepins/orgs",
  "sitepins/sites",
  "sitepins/user-persona",
];

const ALLOWED_FOLDERS = new Set(
  (process.env.UPLOAD_FOLDERS
    ? process.env.UPLOAD_FOLDERS.split(",").map((f) => f.trim())
    : []
  )
    .filter(Boolean)
    .concat(DEFAULT_ALLOWED_FOLDERS),
);

// Images only — without this, an HTML/JS file served from the bucket origin is
// stored XSS. Mirrors AcceptImages on the client so nothing the UI permits is
// rejected here.
const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/svg+xml",
]);

// SVG is a document: opened directly it can run script in the bucket's origin.
// It is still allowed (avatars use it, and <img> never executes SVG script),
// but forced to download on direct navigation, which is what closes the hole.
const INLINE_UNSAFE_MIME = new Set(["image/svg+xml"]);

// Matches the client's MAX_SIZE (10 MB) so the UI can't accept a file the API
// then rejects.
const MAX_UPLOAD_BYTES =
  Number(process.env.MAX_UPLOAD_BYTES) || 10 * 1024 * 1024;

// Keeps the original name recognizable while making it inert as a key: no
// path separators, no traversal, bounded length.
const safeFileName = (name: string): string => {
  const base = (name.split(/[\\/]/).pop() || "file").replace(/\.{2,}/g, ".");
  return base.replace(/[^A-Za-z0-9._-]/g, "_").slice(-100);
};

// public upload file to s3
const uploadFile = multer({
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(new Error("Unsupported file type. Images only."));
    }
    cb(null, true);
  },
  storage: multerS3({
    // multer-s3 pins an older @aws-sdk/client-s3 major than the one we use.
    s3: s3Client as unknown as NonNullable<
      Parameters<typeof multerS3>[0]
    >["s3"],
    bucket: config.s3_bucket_name as string,
    contentType: multerS3.AUTO_CONTENT_TYPE,
    contentDisposition: function (req, file, cb) {
      cb(null, INLINE_UNSAFE_MIME.has(file.mimetype) ? "attachment" : "inline");
    },
    acl: function (req, file, cb) {
      const permission = uploadBody(req).permission;
      if (permission === "public-read" || permission === "private") {
        cb(null, permission);
      } else {
        cb(new Error("Invalid ACL type specified"));
      }
    },
    key: function (req: express.Request, file, cb) {
      const folder = uploadBody(req).folder;
      if (!folder) {
        return cb(new Error("Folder name is required"));
      }
      if (!ALLOWED_FOLDERS.has(folder)) {
        return cb(new Error("Invalid folder"));
      }
      // randomUUID prevents one uploader from clobbering another's object by
      // racing the same millisecond + filename.
      cb(
        null,
        `${folder}/${Date.now()}-${randomUUID()}-${safeFileName(file.originalname)}`,
      );
    },
  }),
});

// upload router
bucketRouter.post(
  "/upload",
  authMiddleware.verifyAuth(
    ENUM_ROLE.ADMIN,
    ENUM_ROLE.MODERATOR,
    ENUM_ROLE.USER,
  ),
  uploadLimiter,
  (req, res, next) => {
    const uploadSingle = uploadFile.single("file");

    uploadSingle(req, res, (err) => {
      if (err) {
        return next(err);
      }
      return sendResponse(res, {
        statusCode: 200,
        success: true,
        message: "File uploaded successfully",
        result: req.file,
      });
    });
  },
);

// delete router
// Delete by raw object key. Bucket keys carry no per-user/per-org ownership,
// so a regular user deleting an arbitrary key would be a cross-tenant delete.
// Restricted to ADMIN (no self-serve caller exists; the web app never calls
// this route).
bucketRouter.delete(
  "/delete/:key",
  authMiddleware.verifyAuth(ENUM_ROLE.ADMIN),
  async (req, res, next) => {
    const key = decodeURIComponent(req.params.key as string);

    if (!key) {
      return sendResponse(res, {
        statusCode: 400,
        success: false,
        message: "Key is required",
      });
    }

    try {
      // Check if file exists before deleting
      const headResult = await checkFileExists(key);
      if (!headResult) {
        return sendResponse(res, {
          statusCode: 404,
          success: false,
          message: "File not found",
        });
      }

      const deleteResult = await deleteFile(key);
      if (!deleteResult) {
        return sendResponse(res, {
          statusCode: 500,
          success: false,
          message: "Failed to delete file",
        });
      }

      // Verify deletion after deletion
      const existsAfterDelete = await checkFileExists(key);
      if (existsAfterDelete) {
        // Retry logic
        let retryCount = 0;
        const maxRetries = 3;
        let deleted = false;

        while (retryCount < maxRetries && !deleted) {
          await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second
          await deleteFile(key);
          const stillExists = await checkFileExists(key);
          if (!stillExists) {
            deleted = true;
          }
          retryCount++;
        }

        if (!deleted) {
          return sendResponse(res, {
            statusCode: 500,
            success: false,
            message: "Failed to delete file after multiple attempts",
          });
        }
      }

      return sendResponse(res, {
        statusCode: 200,
        success: true,
        message: "File deleted successfully",
      });
    } catch (error) {
      next(error);
    }
  },
);

export default bucketRouter;
