export type ProjectType = {
  project_id: string;
  user_id: string;
  org_id: string;
  project_name: string;
  project_image: string;
  provider: string;
  repository: string;
  branch: string;
  visibility: "public" | "private";
  status: "active" | "archived";
  generator: string;
  site_url: string;
};

export type ProjectFilterOptions = {
  search?: string | number;
};
