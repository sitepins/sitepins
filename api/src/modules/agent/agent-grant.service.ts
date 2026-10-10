import ApiError from "@/errors/ApiError";
import { runAgentAccessGuard } from "@/lib/extensionGuards";
import { nanoId } from "@/lib/nanoId";
import { requireOrgAccess } from "@/lib/resourceAuth";
import { Organization } from "@/modules/organization/organization.model";
import { Project } from "@/modules/project/project.model";
import { AgentGrant } from "./agent-grant.model";
import { agentTokenIndex, generateAgentToken } from "./agent.auth";
import { TAgentGrant } from "./agent.type";
import { tokenGrantSchema } from "./agent.validation";

const PUBLIC_FIELDS =
  "grant_id token_hint name org_id project_ids all_projects scopes write_mode expires_at last_used_at createdAt";

export const listGrants = async (userId: string) => {
  const grants = await AgentGrant.find({
    user_id: userId,
    expires_at: { $gt: new Date() },
  })
    .select(PUBLIC_FIELDS)
    .sort({ createdAt: -1 })
    .lean();
  const orgIds = [...new Set(grants.map((g) => g.org_id))];
  const projectIds = [...new Set(grants.flatMap((g) => g.project_ids))];
  const [orgs, projects] = await Promise.all([
    Organization.find({ org_id: { $in: orgIds } })
      .select("org_id org_name")
      .lean(),
    Project.find({ project_id: { $in: projectIds } })
      .select("project_id project_name")
      .lean(),
  ]);
  const orgName = new Map(orgs.map((o) => [o.org_id, o.org_name]));
  const projectName = new Map(
    projects.map((p) => [p.project_id, p.project_name]),
  );
  return grants.map((g) => ({
    ...g,
    org_name: orgName.get(g.org_id),
    projects: g.project_ids.map((id) => ({
      project_id: id,
      name: projectName.get(id),
    })),
  }));
};

export const createTokenGrant = async (userId: string, body: unknown) => {
  const input = tokenGrantSchema.parse(body);
  // A user may only delegate projects they can reach themselves.
  await requireOrgAccess(userId, input.org_id);
  const projectIds = input.all_projects ? [] : [...new Set(input.project_ids)];
  // Same check agents get on every call, so a token that can't be used is never created.
  if (input.all_projects) {
    const org = await Organization.findOne({ org_id: input.org_id })
      .select("owner")
      .lean();
    await runAgentAccessGuard({
      user_id: userId,
      org_id: input.org_id,
      project_owner_id: org?.owner ?? userId,
      write: false,
    });
  } else {
    const projects = await Project.find({
      project_id: { $in: projectIds },
      org_id: input.org_id,
    })
      .select("project_id user_id")
      .lean();
    if (projects.length !== projectIds.length) {
      throw new ApiError(
        "Some projects don't exist in this organization",
        400,
        "",
      );
    }
    for (const project of projects) {
      await runAgentAccessGuard({
        user_id: userId,
        org_id: input.org_id,
        project_id: project.project_id,
        project_owner_id: project.user_id,
        write: false,
      });
    }
  }

  const token = generateAgentToken();
  const grant: TAgentGrant = {
    grant_id: await nanoId(16),
    user_id: userId,
    token_index: agentTokenIndex(token),
    token_hint: token.slice(0, 9),
    name: input.name,
    org_id: input.org_id,
    project_ids: projectIds,
    all_projects: input.all_projects,
    scopes: [...new Set(input.scopes)],
    write_mode: input.write_mode,
    expires_at: new Date(
      Date.now() + input.expires_in_days * 24 * 60 * 60 * 1000,
    ),
  };
  await AgentGrant.create(grant);
  const { token_index: _index, ...publicGrant } = grant;
  // The plaintext token is returned exactly once and never stored.
  return { token, grant: publicGrant };
};

export const revokeGrant = async (userId: string, grantId: string) => {
  const grant = await AgentGrant.findOneAndDelete({
    grant_id: grantId,
    user_id: userId,
  }).lean();
  if (!grant) throw new ApiError("Access token not found", 404, "");
  return { grant_id: grantId, revoked: true };
};
