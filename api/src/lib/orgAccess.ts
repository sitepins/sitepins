import { Organization } from "@/modules/organization/organization.model";

/**
 * True when `userId` is the owner of, or a member of, the organization.
 * Shared by the realtime gateways (socket.io + Hocuspocus) so a client can
 * never join another tenant's room / document just by knowing its ids.
 */
export async function isOrgMember(
  userId: string | undefined | null,
  orgId: string | undefined | null,
): Promise<boolean> {
  if (!userId || !orgId) return false;

  const org = await Organization.findOne({ org_id: orgId })
    .select("owner members.user_id")
    .lean();

  if (!org) return false;
  if (org.owner === userId) return true;
  return (org.members ?? []).some((m) => m.user_id === userId);
}
