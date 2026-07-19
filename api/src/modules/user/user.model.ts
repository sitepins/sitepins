import { generateUserId } from "@/lib/userIdGenerator";
import mongoose, { model } from "mongoose";
import { EProvider, UserMethods, UserModel, UserType } from "./user.type";

const userSchema = new mongoose.Schema<UserType, UserModel, UserMethods>(
  {
    user_id: {
      type: String,
      required: true,
      unique: true,
    },
    full_name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    image: {
      type: String,
    },
    password: {
      type: String,
      min: [8, "Must be at least 8, got {VALUE}"],
      max: 12,
    },
    country: {
      type: String,
    },
    verified: {
      type: Boolean,
      default: false,
    },
    role: {
      type: String,
      default: "user",
    },
    provider: {
      type: String,
      enum: Object.values(EProvider),
      required: true,
      default: EProvider.Credentials,
    },
    subscribed: {
      type: Boolean,
      default: true,
    },
    note: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

userSchema.methods.isUserExist = async function (
  params: string
): Promise<Partial<UserType> | null> {
  const userId = generateUserId(params);
  return await User.findOne(
    {
      id: userId,
    },
    {
      user_id: 1,
      email: 1,
      full_name: 1,
      password: 1,
      country: 1,
      image: 1,
      verified: 1,
      role: 1,
    }
  );
};

userSchema.index({
  email: "text",
});

export const User = model<UserType, UserModel>("user", userSchema);
