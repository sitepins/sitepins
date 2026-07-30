import mongoose from "mongoose";
import { logger } from "@/lib/logger";

export async function dbConnect() {
  const MONGO_URI = process.env.MONGO_URI!;

  if (!MONGO_URI) {
    throw new Error(
      "Please define the MONGODB_URI environment variable inside .env.local",
    );
  }

  try {
    await mongoose.connect(MONGO_URI);
    logger.info("[+] Database is connected successfully");
  } catch (error) {
    logger.error("[-] Database is failed to connect", error);
    throw error;
  }
}
