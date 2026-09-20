import { runUserDeletionHooks } from "@/lib/entitlements";
import { TAuthUser } from "@/types";
import mongoose, { ClientSession } from "mongoose";
import { Authentication } from "../authentication/authentication.model";
import { gitProviderService } from "../git-provider/git-provider.service";
import { Organization } from "../organization/organization.model";
import { ProjectContent } from "../project-content/project-content.model";
import { ProjectLog } from "../project-log/project-log.model";
import { ProjectPreview } from "../project-preview/project-preview.model";
import { Project } from "../project/project.model";
import { UserPreference } from "../user-preference/user-preference.model";
import { User } from "./user.model";

export type PurgeUserDataArgs = {
  userId: string;
  // the user as known at deletion time; handed to the extension hooks
  user: TAuthUser;
  reason?: string;
  session: ClientSession;
  // better-auth keys accounts/sessions by the users row's `_id`, and adapter
  // versions differ on ObjectId vs string — callers pass every id the row
  // might be referenced by.
  authIds?: (string | mongoose.Types.ObjectId)[];
};

// Widen each id to both the string and the ObjectId spelling, so a row written
// by either adapter version is matched.
const expandAuthIds = (ids: (string | mongoose.Types.ObjectId)[]) => {
  const out = new Set<string | mongoose.Types.ObjectId>();
  for (const id of ids) {
    if (!id) continue;
    out.add(id);
    if (typeof id === "string" && mongoose.Types.ObjectId.isValid(id)) {
      out.add(new mongoose.Types.ObjectId(id));
    } else if (typeof id !== "string") {
      out.add(String(id));
    }
  }
  return [...out];
};

// Every row a deleted account owns, removed inside the caller's transaction.
//
// Both deletion paths funnel through here — the self-serve one in
// user.service and the admin/webhook one in the cloud wrapper — so neither can
// drift and start leaving a collection behind, which is how user_preferences
// and git_provider rows outlived their accounts before.
//
// Two rules hold this together, and breaking either one strands data:
//
//  1. Nothing here may touch a service outside this database (S3, Brevo, a git
//     host). A throw from one of those aborts the transaction, and any
//     already-committed account removal is not coming back. Callers run those
//     side effects AFTER the commit, each guarded on its own.
//  2. Auth rows go through the default mongoose connection, not the separate
//     one auth.ts opens for better-auth. Same database, different MongoClient —
//     and a session can only be used by the client that created it.
export const purgeUserData = async ({
  userId,
  user,
  reason,
  session,
  authIds = [],
}: PurgeUserDataArgs) => {
  await User.deleteOne({ user_id: userId }, { session });

  const candidates = expandAuthIds(authIds);
  const db = mongoose.connection?.db;
  if (candidates.length > 0 && db && typeof db.collection === "function") {
    await db
      .collection("accounts")
      .deleteMany({ userId: { $in: candidates } }, { session });
    await db
      .collection("sessions")
      .deleteMany({ userId: { $in: candidates } }, { session });
  }

  await Organization.deleteMany({ owner: userId }, { session });
  // Orgs owned by somebody else outlive this account — only its membership goes.
  await Organization.updateMany(
    { "members.user_id": userId },
    { $pull: { members: { user_id: userId } } },
    { session },
  );

  await Project.deleteMany({ user_id: userId }, { session });

  // delete project logs written from a client-supplied user_id
  const logOwnerIds = [
    ...new Set([userId, ...candidates.map((id) => String(id))]),
  ];
  await ProjectLog.deleteMany({ user_id: { $in: logOwnerIds } }, { session });
  await ProjectContent.deleteMany({ user_id: userId }, { session });
  await ProjectPreview.deleteMany({ user_id: userId }, { session });
  await UserPreference.deleteMany({ user_id: userId }, { session });
  await Authentication.deleteMany({ user_id: userId }, { session });
  await gitProviderService.deleteProviderService(userId, session);

  // Last, so extensions archive (and clean up) a user whose own rows are gone.
  await runUserDeletionHooks({ userId, user, reason, session });
};
