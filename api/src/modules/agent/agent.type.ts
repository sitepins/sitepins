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

export enum EAgentWriteMode {
  DIRECT = "direct",
  PULL_REQUEST = "pull_request",
}

export type TAgentGrant = {
  grant_id: string;
  user_id: string;
  token_index: string;
  token_hint: string;
  name: string;
  org_id: string;
  project_ids: string[];
  all_projects?: boolean;
  scopes: EAgentScope[];
  write_mode: EAgentWriteMode;
  expires_at?: Date;
  last_used_at?: Date;
  createdAt?: Date;
  updatedAt?: Date;
};

/** Who is calling, resolved once per request from a verified credential. */
export type TAgentContext = {
  user_id: string;
  user_name: string;
  user_email: string;
  grant: TAgentGrant;
  scopes: Set<EAgentScope>;
  client_name: string;
  token: string;
};
