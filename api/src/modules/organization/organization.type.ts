export type Member = {
  email: string;
  user_id: string;
  role: "admin" | "editor";
};

export type SandboxIntegration = {
  token: string;
  team_id: string;
  project_id: string;
  project_name?: string;
  username?: string;
};

export type OrgOwnerData = {
  user_id: string;
  email?: string;
  image?: string;
  full_name?: string;
  active_package?: unknown;
};

export type OrganizationType = {
  org_name: string;
  org_id: string;
  org_image: string;
  owner: string;
  members: Member[];
  default: boolean;
  status: "active" | "archived";
  ownerData?: OrgOwnerData[];
  sandbox?: SandboxIntegration | null;
};

export type OrgFilterOptions = {
  search?: string | number;
};
