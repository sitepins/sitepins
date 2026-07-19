import { useGetOrgsQuery } from "@/redux/features/orgs/org-api";

export function useVercelIntegration(orgId: string) {
  const { data: orgs } = useGetOrgsQuery();
  const normalized = orgId?.startsWith("org-") ? orgId.slice(4) : orgId;
  const org = orgs?.find((o) => o.org_id === normalized);
  const vi = org?.sandbox;

  return {
    isConnected: !!vi?.token && !!vi?.project_id,
    vercelToken: vi?.token,
    vercelTeamId: vi?.team_id,
    vercelProjectId: vi?.project_id,
    username: vi?.username,
  };
}
