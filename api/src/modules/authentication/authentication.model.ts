import mongoose, { model } from "mongoose";
import { AuthenticationType } from "./authentication.type";

// password verification token model
export const authenticationSchema = new mongoose.Schema<AuthenticationType>(
  {
    user_id: {
      type: String,
      required: true,
      unique: true,
    },
    token: {
      type: String,
      required: true,
      unique: true,
    },
    expires: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

export const Authentication = model<AuthenticationType>(
  "authentication",
  authenticationSchema
);
