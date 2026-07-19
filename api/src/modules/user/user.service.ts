import { auth } from "@/auth";
import {
  deleteBrevoContact,
  updateBrevoContact,
  updateBrevoContactEmail,
} from "@/lib/brevoConfig";
import { sendMail } from "@/lib/mailer";
import { enforcePlanLimits, runUserDeletionHooks } from "@/lib/entitlements";
import { fromNodeHeaders } from "better-auth/node";
import { Request } from "express";
import mongoose from "mongoose";
import { gitProviderService } from "../git-provider/git-provider.service";
import { Organization } from "../organization/organization.model";
import { ProjectLog } from "../project-log/project-log.model";
import { ProjectContent } from "../project-content/project-content.model";
import { ProjectPreview } from "../project-preview/project-preview.model";
import { Project } from "../project/project.model";
import { User } from "./user.model";
import { UserType } from "./user.type";

// get single user data
const getSingleUserService = async (id: string): Promise<UserType | null> => {
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

  // Update contact country in Brevo
  try {
    if (result && result.email) {
      await updateBrevoContact({
        email: result.email,
        updateType: "country",
        country,
      });
    }
  } catch (err) {
    console.error("Failed to update Brevo contact country:", err);
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

  // When email changes, update the email in Brevo
  if (oldEmail && oldEmail !== email && result) {
    try {
      await updateBrevoContactEmail(oldEmail, email);
    } catch (err) {
      console.error("Failed to update Brevo contact email:", err);
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

    const existingUser = req.user!;

    await Organization.deleteMany({ owner: existingUser.user_id }, { session });
    await Project.deleteMany({ user_id: existingUser.user_id }, { session });
    await ProjectLog.deleteMany({ user_id: existingUser.user_id }, { session });
    await ProjectContent.deleteMany({ user_id: existingUser.user_id }, { session });
    await ProjectPreview.deleteMany({ user_id: existingUser.user_id }, { session });

    await runUserDeletionHooks({
      userId: existingUser.user_id,
      user: existingUser,
      reason,
      session,
    });

    await gitProviderService.deleteProviderService(existingUser.user_id);

    // delete contact from Brevo
    try {
      await deleteBrevoContact(existingUser.email);
    } catch (err) {
      console.error("Failed to delete Brevo contact after user deletion:", err);
    }

    // send mail to user
    try {
      if (existingUser.email && existingUser.email.trim()) {
        await sendMail({
          to: existingUser.email,
          kind: "delete_account",
        });
      } else {
        console.warn(
          "Skipping account deletion email: missing email for userId=",
          existingUser.user_id,
        );
      }
    } catch (error) {
      console.error("Failed to send account deletion email:", error);
    }

    await session.commitTransaction();
    session.endSession();

    return { success, message };
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error(error);
    throw error;
  }
};

// check limits
const checkLimitsService = async (userId: string) => {
  await enforcePlanLimits(userId);
  return { success: true, message: "Limits enforced successfully" };
};

export const userService = {
  getSingleUserService,
  setPasswordService,
  updateUserCountryService,
  updateUserEmailService,
  deleteUserService,
  checkLimitsService,
};
