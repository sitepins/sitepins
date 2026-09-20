import mongoose, { model } from "mongoose";
import { EProvider, TUserModel, TUserType } from "./user.type";

const userSchema = new mongoose.Schema<TUserType, TUserModel>(
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
  },
);

userSchema.index({
  email: "text",
});

export const User = model<TUserType, TUserModel>("user", userSchema);
