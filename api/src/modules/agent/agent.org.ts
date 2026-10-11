import { ENUM_PERMISSIONS } from "@/enums/roles";
import ApiError from "@/errors/ApiError";
import { runAgentAccessGuard, runPolicyGuard } from "@/lib/extensionGuards";
import { logger } from "@/lib/logger";
import { requireOrgPermission } from "@/lib/resourceAuth";
import { Organization } from "@/modules/organization/organization.model";
import { organizationService } from "@/modules/organization/organization.service";
import { TMember } from "@/modules/organization/organization.type";
import { Project } from "@/modules/project/project.model";
import { User } from "@/modules/user/user.model";
import { requireScope } from "./agent.auth";
import { EAgentScope, TAgentContext } from "./agent.type";

export type TMemberRole = TMember["role"];

const loadOrg = async (orgId: string) => {
  const org = await Organization.findOne({ org_id: orgId })
    .select("org_id org_name owner members status default")
    .lean();
  if (!org) throw new ApiError("Organization not found", 404, "");
  return org;
};

export const getOrganization = async (agent: TAgentContext) => {
  requireScope(agent, EAgentScope.ORG_READ);
  const orgId = agent.grant.org_id;
  const access = await requireOrgPermission(
    agent.user_id,
    orgId,
    ENUM_PERMISSIONS.VIEW_MEMBERS,
  );
  const [org, projectCount] = await Promise.all([
    loadOrg(orgId),
    Project.countDocuments({ org_id: orgId }),
  ]);
  const ids = [
    org.owner,
    ...(org.members ?? []).map((m) => m.user_id).filter(Boolean),
  ] as string[];
  const users = await User.find({ user_id: { $in: ids } })
    .select("user_id full_name email")
    .lean();
  const byId = new Map(users.map((u) => [u.user_id, u]));
  const owner = byId.get(org.owner);
  return {
    org_id: org.org_id,
    name: org.org_name,
    status: org.status,
    default: org.default,
    your_role: access.role,
    owner: {
      user_id: org.owner,
      name: owner?.full_name,
      email: owner?.email,
    },
    members: (org.members ?? [])
      .filter((m) => m.user_id !== org.owner)
      .map((m) => ({
        ...(m.user_id && { user_id: m.user_id }),
        name: m.user_id ? byId.get(m.user_id)?.full_name : undefined,
        email: m.email,
        role: m.role,
        status: m.status ?? "active",
      })),
    project_count: projectCount,
  };
};

const prepareMemberChange = async (agent: TAgentContext) => {
  requireScope(agent, EAgentScope.MEMBERS_WRITE);
  const orgId = agent.grant.org_id;
  await requireOrgPermission(
    agent.user_id,
    orgId,
    ENUM_PERMISSIONS.MANAGE_MEMBERS,
  );
  const org = await loadOrg(orgId);
  await runAgentAccessGuard({
    user_id: agent.user_id,
    org_id: orgId,
    project_owner_id: org.owner,
    write: true,
  });
  return org;
};

const audit = (agent: TAgentContext, action: string, target: string) =>
  logger.info("[agents] member change", {
    action,
    target,
    org_id: agent.grant.org_id,
    user_id: agent.user_id,
    grant_id: agent.grant.grant_id,
    via: agent.client_name,
  });

export const inviteMember = async (
  agent: TAgentContext,
  input: { email: string; role: TMemberRole },
) => {
  const org = await prepareMemberChange(agent);
  await runPolicyGuard({
    event: "organization:member:add",
    user_id: agent.user_id,
    org_id: org.org_id,
  });
  await organizationService.addTeamMemberService({
    org_id: org.org_id,
    teamMember: { email: input.email, role: input.role },
    loggedInUserId: agent.user_id,
  });
  audit(agent, "invite", input.email);
  return { invited: input.email, role: input.role, org_id: org.org_id };
};

const ownerRefs = (org: { owner: string }, ownerEmail?: string) =>
  [org.owner, ownerEmail?.toLowerCase()].filter(Boolean);

const assertNotOwner = async (org: { owner: string }, member: string) => {
  const owner = await User.findOne({ user_id: org.owner })
    .select("email")
    .lean();
  if (ownerRefs(org, owner?.email).includes(member.toLowerCase())) {
    throw new ApiError("The organization owner can't be changed", 403, "");
  }
};

export const updateMemberRole = async (
  agent: TAgentContext,
  input: { member: string; role: TMemberRole },
) => {
  const org = await prepareMemberChange(agent);
  await assertNotOwner(org, input.member);
  await organizationService.updateRoleService({
    org_id: org.org_id,
    teamMember: { user_id: input.member, role: input.role },
    loggedInUserId: agent.user_id,
  });
  audit(agent, `role:${input.role}`, input.member);
  return { member: input.member, role: input.role, org_id: org.org_id };
};

export const removeMember = async (
  agent: TAgentContext,
  input: { member: string },
) => {
  const org = await prepareMemberChange(agent);
  await assertNotOwner(org, input.member);
  await organizationService.removeTeamMemberService({
    org_id: org.org_id,
    userId: input.member,
    loggedInUserId: agent.user_id,
  });
  audit(agent, "remove", input.member);
  return { removed: input.member, org_id: org.org_id };
};
