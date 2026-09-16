import { auth, db } from "@/auth";
import { emitUserUpdate, runUserDeletionHooks } from "@/lib/entitlements";
import { logger } from "@/lib/logger";
import { sendMail } from "@/lib/mailer";
import { requireUser } from "@/lib/requireUser";
import { fromNodeHeaders } from "better-auth/node";
import { Request } from "express";
import mongoose from "mongoose";
import { gitProviderService } from "../git-provider/git-provider.service";
import { Organization } from "../organization/organization.model";
import { ProjectContent } from "../project-content/project-content.model";
import { ProjectLog } from "../project-log/project-log.model";
import { ProjectPreview } from "../project-preview/project-preview.model";
import { Project } from "../project/project.model";
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

// update email
const updateUserEmailService = async (email: string, id: string) => {
  const user = await User.findOne({ user_id: id });
  const oldEmail = user?.email;

  const result = await User.findOneAndUpdate(
    { user_id: id },
    { email },
    {
      returnDocument: "after",
    },
  );

  // When email changes, notify extensions
  if (oldEmail && oldEmail !== email && result) {
    try {
      await emitUserUpdate({
        type: "email",
        oldEmail,
        newEmail: email,
      });
    } catch (err) {
      logger.error("Failed to emit user update event for email", err);
    }
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
const deleteUserService = async (reason: string, req: Request) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { success, message } = await auth.api.deleteUser({
      body: {},
      headers: fromNodeHeaders(req.headers),
    });

    if (!success) throw new Error(message);

    const existingUser = requireUser(req);

    const userToDelete = await User.findOne({
      $or: [
        { user_id: existingUser.user_id },
        { email: existingUser.email?.toLowerCase() },
      ],
    });

    const idCandidates: (string | mongoose.Types.ObjectId)[] = [
      existingUser.user_id,
      (existingUser as { id?: string }).id,
      (existingUser as { _id?: string })._id,
      userToDelete?._id,
      userToDelete?._id?.toString(),
    ].filter(Boolean) as (string | mongoose.Types.ObjectId)[];

    const objectIdCandidates =
      mongoose?.Types?.ObjectId &&
      typeof mongoose.Types.ObjectId.isValid === "function"
        ? idCandidates
            .filter(
              (id) =>
                typeof id === "string" && mongoose.Types.ObjectId.isValid(id),
            )
            .map((id) => new mongoose.Types.ObjectId(id as string))
        : [];

    const allCandidates = [
      ...new Set([...idCandidates, ...objectIdCandidates]),
    ];

    if (db && typeof db.collection === "function") {
      await db
        .collection("accounts")
        .deleteMany({ userId: { $in: allCandidates } }, { session });
      await db
        .collection("sessions")
        .deleteMany({ userId: { $in: allCandidates } }, { session });
    }

    await Organization.deleteMany({ owner: existingUser.user_id }, { session });
    await Project.deleteMany({ user_id: existingUser.user_id }, { session });
    await ProjectLog.deleteMany({ user_id: existingUser.user_id }, { session });
    await ProjectContent.deleteMany(
      { user_id: existingUser.user_id },
      { session },
    );
    await ProjectPreview.deleteMany(
      { user_id: existingUser.user_id },
      { session },
    );

    await runUserDeletionHooks({
      userId: existingUser.user_id,
      user: existingUser,
      reason,
      session,
    });

    await gitProviderService.deleteProviderService(existingUser.user_id);

    // send mail to user
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

    await session.commitTransaction();
    session.endSession();

    return { success, message };
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    logger.error("User deletion failed", error);
    throw error;
  }
};

export const userService = {
  getSingleUserService,
  setPasswordService,
  updateUserCountryService,
  updateUserEmailService,
  deleteUserService,
};
