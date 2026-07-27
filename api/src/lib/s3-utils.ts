import config from "@/config/variables";
import {
  DeleteObjectCommand,
  HeadObjectCommand,
  S3Client,
  S3ClientConfig,
} from "@aws-sdk/client-s3";

// S3 Client Configuration.
// Works with any S3-compatible provider (AWS S3, Cloudflare R2, MinIO,
// Backblaze B2, DigitalOcean Spaces). Configure S3_ENDPOINT/S3_REGION/keys.
const s3Config: S3ClientConfig = {
  region: config.s3_region as string,
  endpoint: config.s3_endpoint,
  // Path-style is required by MinIO and some self-hosted gateways; virtual-
  // hosted style (default) is used by AWS, R2 and DO Spaces.
  forcePathStyle: config.s3_force_path_style,
  credentials: {
    accessKeyId: config.s3_access_key as string,
    secretAccessKey: config.s3_secret_key as string,
  },
};

export const s3Client = new S3Client(s3Config);

/**
 * Delete a file from S3 bucket
 * @param key - S3 object key (e.g., "sitepins/users/123.png")
 */
export const deleteFile = async (key: string) => {
  const deleteParams = { Bucket: config.s3_bucket_name, Key: key };

  try {
    return await s3Client.send(new DeleteObjectCommand(deleteParams));
  } catch (err: any) {
    throw new Error(`Failed to delete file: ${err.message}`);
  }
};

/**
 * Check if a file exists in S3 bucket
 * @param key - S3 object key
 */
export const checkFileExists = async (key: string) => {
  const headParams = { Bucket: config.s3_bucket_name, Key: key };

  try {
    await s3Client.send(new HeadObjectCommand(headParams));
    return true;
  } catch (err: any) {
    if (err.name === "NotFound") {
      return false;
    }
    throw new Error(`Failed to check file existence: ${err.message}`);
  }
};
