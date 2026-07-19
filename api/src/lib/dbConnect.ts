import mongoose from "mongoose";

export async function dbConnect() {
  const MONGO_URI = process.env.MONGO_URI!;

  if (!MONGO_URI) {
    throw new Error(
      "Please define the MONGODB_URI environment variable inside .env.local"
    );
  }

  try {
    await mongoose.connect(MONGO_URI);
    console.log("[+] Database is connected successfully");
  } catch (error) {
    console.log("[-] Database is failed to connect");
    throw error;
  }
}
