export type TMember = {
  email: string;
  user_id: string;
  role: "admin" | "editor";
};

export type TSandboxIntegration = {
  token: string;
  team_id: string;
  project_id: string;
  project_name?: string;
  username?: string;
};

export type TOrgOwnerData = {
  user_id: string;
  email?: string;
  image?: string;
  full_name?: string;
};

export type TOrganizationType = {
  org_name: string;
  org_id: string;
  org_image: string;
  owner: string;
  members: TMember[];
  default: boolean;
  status: "active" | "archived";
  ownerData?: TOrgOwnerData[];
  sandbox?: TSandboxIntegration | null;
};

export type TOrgFilterOptions = {
  search?: string | number;
};
