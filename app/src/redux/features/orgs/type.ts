type TRole = "editor" | "admin";

export type TMember = {
  role: TRole;
  _id: string;
  full_name: string;
  image: string;
  email: string;
  user_id: string;
  delete?: boolean;
};

export type TSandboxIntegration = {
  token: string;
  team_id: string;
  project_id: string;
  project_name?: string;
  username?: string;
};

export type TOrg = {
  org_name: string;
  org_id: string;
  owner: string;
  org_image?: string;
  members: TMember[];
  projectCount: number;
  default: boolean;
  status: "active" | "archived";
  sandbox?: TSandboxIntegration | null;
  ownerData?: {
    user_id: string;
    email: string;
    image: string;
    full_name: string;
    active_package?: string;
  }[];
};
