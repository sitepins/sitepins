import { Organization } from "@/modules/organization/organization.model";
import { logger } from "./logger";
import { escapeRegex } from "./regexEscape";

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export const emailMatcher = (email: string) =>
  new RegExp(`^${escapeRegex(normalizeEmail(email))}$`, "i");

// An invite to an address with no account carries no user_id. At signup the
// new account claims those rows by email, which is what grants the access.
export const reconcilePendingInvites = async (
  email: string,
  userId: string,
): Promise<number> => {
  if (!email || !userId) return 0;

  const matcher = emailMatcher(email);

  const result = await Organization.updateMany(
    { members: { $elemMatch: { email: matcher, status: "pending" } } },
    {
      $set: {
        "members.$[invite].user_id": userId,
        "members.$[invite].status": "active",
      },
    },
    {
      arrayFilters: [{ "invite.email": matcher, "invite.status": "pending" }],
    },
  );

  if (result.modifiedCount > 0) {
    logger.info(
      `Linked ${result.modifiedCount} organization(s) to a newly registered invitee`,
    );
  }

  return result.modifiedCount;
};
