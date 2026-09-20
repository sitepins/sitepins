import { auth } from "@/auth";
import { emitUserUpdate } from "@/lib/entitlements";
import { logger } from "@/lib/logger";
import { sendMail } from "@/lib/mailer";
import { requireUser } from "@/lib/requireUser";
import { fromNodeHeaders } from "better-auth/node";
import { Request } from "express";
import mongoose from "mongoose";
import { purgeUserData } from "./user.deletion";
import { User } from "./user.model";
import { TUserType } from "./user.type";

// get single user data
const getSingleUserService = async (id: string): Promise<TUserType | null> => {
  const user = await User.aggregate([
    {
      $match: { user_id: id },
    },
    {
      $project: {
        user_id: 1,
        full_name: 1,
        country: 1,
        image: 1,
        email: 1,
        note: 1,
        provider: 1,
        status: 1,
        createdAt: 1,
      },
    },
  ]);

  return user[0];
};

// update user country
const updateUserCountryService = async (id: string, country: string) => {
  // check if user already has a country
  const user = await User.findOne({ id });
  if (user?.country) {
    return user;
  }

  // update user country
  const result = await User.findOneAndUpdate(
    { user_id: id },
    { country },
    {
      returnDocument: "after",
    },
  );

  // Notify extensions of country update
  try {
    if (result && result.email) {
      await emitUserUpdate({
        type: "country",
        email: result.email,
        country,
      });
    }
  } catch (err) {
    logger.error("Failed to emit user update event for country", err);
  }

  return result;
};

// set password
const setPasswordService = async (req: Request) => {
  const newPassword = req.body.newPassword;
  const response = await auth.api.setPassword({
    body: { newPassword },
    headers: fromNodeHeaders(req.headers),
  });
  if (response.status) {
    return response;
  }
  throw new Error("Set password failed");
};

// delete user
//
// Self-serve deletion. Everything that writes to our database happens inside
// one transaction; everything that talks to a third party happens after the
// commit, so a failing mail send or storage call can no longer strand the
// account's data.
//
// Note what this deliberately does NOT do: call `auth.api.deleteUser`. That
// removes the users row plus its accounts and sessions immediately and outside
// any transaction, so every failure after it left an account that was gone
// from `users`, absent from `deleted_users`, and still owning its
// organization. The users row is dropped inside the transaction below instead,
// and better-auth's own delete-user endpoint is disabled in auth.ts.
const deleteUserService = async (reason: string, req: Request) => {
  const existingUser = requireUser(req);

  const userToDelete = await User.findOne({
    $or: [
      { user_id: existingUser.user_id },
      { email: existingUser.email?.toLowerCase() },
    ],
  });

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    await purgeUserData({
      userId: existingUser.user_id,
      user: existingUser,
      reason,
      session,
      authIds: [
        (existingUser as { id?: string }).id,
        (existingUser as { _id?: string })._id,
        userToDelete?._id,
      ].filter(Boolean) as (string | mongoose.Types.ObjectId)[],
    });

    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction();
    logger.error("User deletion failed", error);
    throw error;
  } finally {
    session.endSession();
  }

  // Past this point the account is gone for good — report failures, never
  // rethrow them.
  try {
    if (existingUser.email && existingUser.email.trim()) {
      await sendMail({
        to: existingUser.email,
        kind: "delete_account",
      });
    } else {
      logger.warn("Skipping account deletion email: missing email", {
        userId: existingUser.user_id,
      });
    }
  } catch (error) {
    logger.error("Failed to send account deletion email", error);
  }

  return { success: true, message: "User deleted successfully" };
};

export const userService = {
  getSingleUserService,
  setPasswordService,
  updateUserCountryService,
  deleteUserService,
};
