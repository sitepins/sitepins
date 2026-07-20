import config from "@/config/variables";
import { ENUM_ROLE } from "@/enums/roles";
import { checkFileExists, deleteFile, s3Client } from "@/lib/s3-utils";
import { sendResponse } from "@/lib/sendResponse";
import { authMiddleware } from "@/middlewares/authMiddleware";
import express from "express";
import multer from "multer";
import multerS3 from "multer-s3";

const bucketRouter: express.Router = express.Router();

// public upload file to s3
const uploadFile = multer({
  storage: multerS3({
    s3: s3Client as any,
    bucket: config.s3_bucket_name as string,
    acl: function (req, file, cb) {
      const permission = (req as any).body.permission;
      if (permission === "public-read" || permission === "private") {
        cb(null, permission);
      } else {
        cb(new Error("Invalid ACL type specified"));
      }
    },
    key: function (req: express.Request, file, cb) {
      const folder = (req as any).body.folder;
      if (!folder) {
        return cb(new Error("Folder name is required"));
      }
      cb(null, folder + "/" + Date.now().toString() + "-" + file.originalname);
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
  (req, res, next) => {
    const uploadSingle = uploadFile.single("file");

    uploadSingle(req, res, (err: any) => {
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
