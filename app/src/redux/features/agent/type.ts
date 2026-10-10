export enum EAgentScope {
  PROJECTS_READ = "projects:read",
  CONTENT_READ = "content:read",
  CONTENT_WRITE = "content:write",
  MEDIA_WRITE = "media:write",
  SCHEMA_WRITE = "schema:write",
  CODE_WRITE = "code:write",
  GIT_BRANCH = "git:branch",
}

export const AGENT_SCOPES: readonly EAgentScope[] = Object.values(EAgentScope);

/** Always granted; an agent can't do anything useful without them. */
export const REQUIRED_AGENT_SCOPES: readonly EAgentScope[] = [
  EAgentScope.PROJECTS_READ,
  EAgentScope.CONTENT_READ,
];

export enum EAgentWriteMode {
  DIRECT = "direct",
  PULL_REQUEST = "pull_request",
}

export type TAgentGrantSettings = {
  org_id: string;
  all_projects?: boolean;
  project_ids: string[];
  scopes: EAgentScope[];
  write_mode: EAgentWriteMode;
};

export type TAgentGrant = TAgentGrantSettings & {
  grant_id: string;
  token_hint: string;
  name: string;
  expires_at?: string;
  last_used_at?: string;
  createdAt?: string;
  org_name?: string;
  projects?: { project_id: string; name?: string }[];
};

export type TCreatedAgentToken = { token: string; grant: TAgentGrant };
