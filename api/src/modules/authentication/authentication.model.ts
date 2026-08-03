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
    // Failed OTP guesses against this token. Bounds brute force — the code is
    // burned once the budget is spent.
    attempts: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  },
);

export const Authentication = model<AuthenticationType>(
  "authentication",
  authenticationSchema,
);
